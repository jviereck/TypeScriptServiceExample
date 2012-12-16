// Code mostly taken from TypeScript/src/harness/harness.ts with small
// modifications to use a ILanguageServiceHost instead of a ILanguageServiceShimHost.

// Copyright (c) Microsoft. All rights reserved. Licensed under the Apache License, Version 2.0.
// See LICENSE.txt in the project root for complete license information.

///<reference path='ts\src\compiler\typescript.ts'/>
///<reference path='ts\src\services\typescriptServices.ts' />

module ServiceBuilder {
  export class ScriptInfo {
    public version: number;
    public editRanges: { length: number; editRange: TypeScript.ScriptEditRange; }[] = [];

    constructor (public name: string, public content: string, public isResident: bool, public maxScriptVersions: number) {
      this.version = 1;
    }

    public updateContent(content: string, isResident: bool) {
      this.editRanges = [];
      this.content = content;
      this.isResident = isResident;
      this.version++;
    }

    public editContent(minChar: number, limChar: number, newText: string) {
      // Apply edits
      var prefix = this.content.substring(0, minChar);
      var middle = newText;
      var suffix = this.content.substring(limChar);
      this.content = prefix + middle + suffix;

      // Store edit range + new length of script
      this.editRanges.push({
        length: this.content.length,
        editRange: new TypeScript.ScriptEditRange(minChar, limChar, (limChar - minChar) + newText.length)
      });

      if (this.editRanges.length > this.maxScriptVersions) {
        this.editRanges.splice(0, this.maxScriptVersions - this.editRanges.length);
      }

      // Update version #
      this.version++;
    }

    public getEditRangeSinceVersion(version: number): TypeScript.ScriptEditRange {
      if (this.version == version) {
        // No edits!
        return null;
      }

      var initialEditRangeIndex = this.editRanges.length - (this.version - version);
      if (initialEditRangeIndex < 0 || initialEditRangeIndex >= this.editRanges.length) {
        // Too far away from what we know
        return TypeScript.ScriptEditRange.unknown();
      }

      var entries = this.editRanges.slice(initialEditRangeIndex);

      var minDistFromStart = entries.map(x => x.editRange.minChar).reduce((prev, current) => Math.min(prev, current));
      var minDistFromEnd = entries.map(x => x.length - x.editRange.limChar).reduce((prev, current) => Math.min(prev, current));
      var aggDelta = entries.map(x => x.editRange.delta).reduce((prev, current) => prev + current);

      return new TypeScript.ScriptEditRange(minDistFromStart, entries[0].length - minDistFromEnd, aggDelta);
    }
  }

  export class TypeScriptLSH implements Services.ILanguageServiceHost {
    private ls: Services.ILanguageService = null;

    public scripts: ScriptInfo[] = [];
    public maxScriptVersions = 100;

    public addScript(name: string, content: string, isResident = false) {
      var script = new ScriptInfo(name, content, isResident, this.maxScriptVersions);
      this.scripts.push(script);
    }

    public updateScript(name: string, content: string, isResident = false) {
      for (var i = 0; i < this.scripts.length; i++) {
        if (this.scripts[i].name == name) {
          this.scripts[i].updateContent(content, isResident);
          return;
        }
      }

      this.addScript(name, content, isResident);
    }

    public editScript(name: string, minChar: number, limChar:number, newText:string) {
      for (var i = 0; i < this.scripts.length; i++) {
        if (this.scripts[i].name == name) {
          this.scripts[i].editContent(minChar, limChar, newText);
          return;
        }
      }

      throw new Error("No script with name '" + name +"'");
    }

    public getScriptContent(scriptIndex: number): string {
      return this.scripts[scriptIndex].content;
    }

    //////////////////////////////////////////////////////////////////////
    // ILogger implementation
    //
    public information(): bool { return true; }
    public debug(): bool { return true; }
    public warning(): bool { return true; }
    public error(): bool { return true; }
    public fatal(): bool { return true; }

    public log(s: string): void {
      // For debugging...
      //IO.printLine("TypeScriptLS:" + s);
    }

    //////////////////////////////////////////////////////////////////////
    // ILanguageServiceHost implementation
    //

    public getCompilationSettings(): TypeScript.CompilationSettings {
      return null; // i.e. default settings
    }

    public getScriptCount(): number {
      return this.scripts.length;
    }

    public getScriptSourceText(scriptIndex: number, start: number, end: number): string {
      return this.scripts[scriptIndex].content.substring(start, end);
    }

    public getScriptSourceLength(scriptIndex: number): number {
      return this.scripts[scriptIndex].content.length;
    }

    public getScriptId(scriptIndex: number): string {
      return this.scripts[scriptIndex].name;
    }

    public getScriptIsResident(scriptIndex: number): bool {
      return this.scripts[scriptIndex].isResident;
    }

    public getScriptVersion(scriptIndex: number): number {
      return this.scripts[scriptIndex].version;
    }

    public getScriptEditRangeSinceVersion(scriptIndex: number, scriptVersion: number): TypeScript.ScriptEditRange {
      return this.scripts[scriptIndex].getEditRangeSinceVersion(scriptVersion);
    }

    //
    // Return a new instance of the language service shim, up-to-date wrt to typecheck.
    // To access the non-shim (i.e. actual) language service, use the "ls.languageService" property.
    //
    public getLanguageService(): Services.ILanguageService {
      // var ls = new Services.TypeScriptServicesFactory().createLanguageServiceShim(this);
      var ls = new Services.TypeScriptServicesFactory().createLanguageService(this);
      ls.refresh();
      this.ls = ls;
      return ls;
    }

    //
    // Parse file given its source text
    //
    public parseSourceText(fileName: string, sourceText: TypeScript.ISourceText): TypeScript.Script {
      var parser = new TypeScript.Parser();
      parser.setErrorRecovery(null);
      parser.errorCallback = (a, b, c, d) => { };

      var script = parser.parse(sourceText, fileName, 0);
      return script;
    }

    //
    // line and column are 1-based
    //
    public lineColToPosition(fileName: string, line: number, col: number): number {
      var script = this.ls.getScriptAST(fileName);
      assert.notNull(script);
      assert(line >= 1);
      assert(col >= 1);
      assert(line < script.locationInfo.lineMap.length);

      return TypeScript.getPositionFromLineColumn(script, line, col);
    }

    //
    // line and column are 1-based
    //
    public positionToLineCol(fileName: string, position: number): TypeScript.ILineCol {
      var script = this.ls.getScriptAST(fileName);
      assert.notNull(script);

      var result = TypeScript.getLineColumnFromPosition(script, position);

      assert(result.line >= 1);
      assert(result.col >= 1);
      return result;
    }

    //
    // Apply an array of text edits to a string, and return the resulting string.
    //
    public applyEdits(content: string, edits: Services.TextEdit[]): string {
      var result = content;
      edits = this.normalizeEdits(edits);

      for (var i = edits.length - 1; i >= 0; i--) {
        var edit = edits[i];
        var prefix = result.substring(0, edit.minChar);
        var middle = edit.text;
        var suffix = result.substring(edit.limChar);
        result = prefix + middle + suffix;
      }
      return result;
    }

    //
    // Normalize an array of edits by removing overlapping entries and sorting
    // entries on the "minChar" position.
    //
    private normalizeEdits(edits: Services.TextEdit[]): Services.TextEdit[] {
      var result: Services.TextEdit[] = [];

      function mapEdits(edits: Services.TextEdit[]): { edit: Services.TextEdit; index: number; }[] {
        var result = [];
        for (var i = 0; i < edits.length; i++) {
          result.push({ edit: edits[i], index: i });
        }
        return result;
      }

      var temp = mapEdits(edits).sort(function (a, b) {
        var result = a.edit.minChar - b.edit.minChar;
        if (result == 0)
          result = a.index - b.index;
        return result;
      });

      var current = 0;
      var next = 1;
      while (current < temp.length) {
        var currentEdit = temp[current].edit;

        // Last edit
        if (next >= temp.length) {
          result.push(currentEdit);
          current++;
          continue;
        }
        var nextEdit = temp[next].edit;

        var gap = nextEdit.minChar - currentEdit.limChar;

        // non-overlapping edits
        if (gap >= 0) {
          result.push(currentEdit);
          current = next;
          next++;
          continue;
        }

        // overlapping edits: for now, we only support ignoring an next edit
        // entirely contained in the current edit.
        if (currentEdit.limChar >= nextEdit.limChar) {
          next++;
          continue;
        }
        else {
          throw new Error("Trying to apply overlapping edits");
        }
      }

      return result;
    }
  }

  export interface IAssert {
    (result: bool, msg?: string): void;
    equal(left: any, right: any): void;
    notEqual(left: any, right: any): void;
    notNull(result: any): void;
    noDiff(left: string, right: string): void;
    arrayContains(left: any[], right: any[]): void;
    arrayContainsOnce(arr: any[], filter: (item: any) =>bool): void;
    arrayLengthIs(arr: any[], length: number);
  }

  export var assert: IAssert = <any>function (result: bool, msg?: string): void {
    if (!result)
        throw new Error(msg ? msg : "Expected true, got false.");
  }

  assert.arrayLengthIs = <any>function (arr: any[], length: number) {
      if (arr.length != length) {
          var actual = '';
          arr.forEach(n => actual = actual + '\n      ' + n.toString());
          throw new Error('Expected array to have ' + length + ' elements. Actual elements were:' + actual);
      }
  }

  assert.equal = function (left, right) {
      if (left !== right) {
          throw new Error("Expected " + left + " to equal " + right);
      }
  }

  assert.notEqual = function (left, right) {
      if (left === right) {
          throw new Error("Expected " + left + " to *not* equal " + right);
      }
  }

  assert.notNull = function (result) {
      if (result === null) {
          throw new Error("Expected " + result + " to *not* be null");
      }
  }

  assert.noDiff = function (text1, text2) {
      text1 = text1.replace(/^\s+|\s+$/g, "").replace(/\r\n?/g, "\n");
      text2 = text2.replace(/^\s+|\s+$/g, "").replace(/\r\n?/g, "\n");

      if (text1 !== text2) {
          var errorString = "";
          var text1Lines = text1.split(/\n/);
          var text2Lines = text2.split(/\n/);
          for (var i = 0; i < text1Lines.length; i++) {
              if (text1Lines[i] !== text2Lines[i]) {
                  errorString += "Difference at line " + (i + 1) + ":\n";
                  errorString += "                  Left File: " + text1Lines[i] + "\n";
                  errorString += "                 Right File: " + text2Lines[i] + "\n\n";
              }
          }
          throw new Error(errorString);
      }
  }

  assert.arrayContains = function (arr, contains) {
      var found;

      for (var i = 0; i < contains.length; i++) {
          found = false;

          for (var j = 0; j < arr.length; j++) {
              if (arr[j] === contains[i]) {
                  found = true;
                  break;
              }
          }

          if (!found)
              throw new Error("Expected array to contain \"" + contains[i] + "\"");
      }
  }

  assert.arrayContainsOnce = function (arr: any[], filter: (item: any) =>bool) {
      var foundCount = 0;

      for (var i = 0; i < arr.length; i++) {
          if (filter(arr[i])) {
              foundCount++;
          }
      }

      if (foundCount !== 1)
          throw new Error("Expected array to match element only once (instead of " + foundCount + " time(s))");
  }
}