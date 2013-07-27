// Code mostly taken from TypeScript/src/harness/harness.ts with small
// modifications to use a ILanguageServiceHost instead of a ILanguageServiceShimHost.

// Copyright (c) Microsoft. All rights reserved. Licensed under the Apache License, Version 2.0.
// See LICENSE.txt in the project root for complete license information.

///<reference path='ts\src\compiler\typescript.ts'/>
///<reference path='ts\src\services\typescriptServices.ts' />

module ServiceBuilder {

    export class LanguageServicesDiagnostics implements Services.ILanguageServicesDiagnostics {

        constructor(private destination: string) { }

        public log(content: string): void {
            //Imitates the LanguageServicesDiagnostics object when not in Visual Studio
        }

    }



    export class Snapshot implements TypeScript.IScriptSnapshot {
            constructor(private text: string) {
            }

            public getText(start: number, end: number): string {
                return this.text.substring(start, end);
            }

            public getLength(): number {
                return this.text.length;
            }

            public getLineStartPositions(): number[] {
                return TypeScript.TextUtilities.parseLineStarts(TypeScript.SimpleText.fromString(this.text));
            }

            public getTextChangeRangeSinceVersion(scriptVersion: number): TypeScript.TextChangeRange {
                //throw Errors.notYetImplemented();
  	return TypeScript.TextChangeRange.unchanged;
            }
        }

    export class ScriptInfo {
        public version: number = 1;
        public editRanges: { length: number; textChangeRange: TypeScript.TextChangeRange; }[] = [];
        public lineMap: TypeScript.LineMap = null;

        constructor(public fileName: string, public content: string, public isOpen = true) {
            this.setContent(content);
        }

        private setContent(content: string): void {
            this.content = content;
            this.lineMap = TypeScript.LineMap.fromString(content);
        }

        public updateContent(content: string): void {
            this.editRanges = [];
            this.setContent(content);
            this.version++;
        }

        public editContent(minChar: number, limChar: number, newText: string): void {
            // Apply edits
            var prefix = this.content.substring(0, minChar);
            var middle = newText;
            var suffix = this.content.substring(limChar);
            this.setContent(prefix + middle + suffix);

            // Store edit range + new length of script
            this.editRanges.push({
                length: this.content.length,
                textChangeRange: new TypeScript.TextChangeRange(
                    TypeScript.TextSpan.fromBounds(minChar, limChar), newText.length)
            });

            // Update version #
            this.version++;
        }

        public getTextChangeRangeBetweenVersions(startVersion: number, endVersion: number): TypeScript.TextChangeRange {
            if (startVersion === endVersion) {
                // No edits!
                return TypeScript.TextChangeRange.unchanged;
            }

            var initialEditRangeIndex = this.editRanges.length - (this.version - startVersion);
            var lastEditRangeIndex = this.editRanges.length - (this.version - endVersion);

            var entries = this.editRanges.slice(initialEditRangeIndex, lastEditRangeIndex);
            return TypeScript.TextChangeRange.collapseChangesAcrossMultipleVersions(entries.map(e => e.textChangeRange));
        }
    }

  export class TypeScriptLSH implements Services.ILanguageServiceHost {
    private ls: Services.ILanguageService = null;

    private fileNameToScript = new TypeScript.StringHashTable();

      public addDefaultLibrary() {
            //this.addScript("lib.d.ts", Harness.Compiler.libText);
        }

      private getScriptInfo(fileName: string): ScriptInfo {
          return this.fileNameToScript.lookup(fileName);
      }
    public addScript(fileName: string, content: string) {
            var script = new ScriptInfo(fileName, content);
            this.fileNameToScript.add(fileName, script);
        }

     public updateScript(fileName: string, content: string) {
            var script = this.getScriptInfo(fileName);
            if (script !== null) {
                script.updateContent(content);
                return;
            }

            this.addScript(name, content);
        }

      public editScript(fileName: string, minChar: number, limChar: number, newText: string) {
            var script = this.getScriptInfo(fileName);
            if (script !== null) {
                script.editContent(minChar, limChar, newText);
                return;
            }

            throw new Error("No script with name '" + name + "'");
        }


      public getScriptContent(fileName: string): string {
	  return this.getScriptInfo(fileName).content;
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


    public getScriptFileNames(): string[] {
	return this.fileNameToScript.getAllKeys()
    }

      public getScriptIsOpen(fileName: string): bool {
	  return this.getScriptInfo(fileName).isOpen;
    }

    public getScriptSourceText(fileName: string, start: number, end: number): string {
      return this.getScriptInfo(fileName).content.substring(start, end);
    }

    public getScriptSourceLength(fileName: string): number {
      return this.getScriptInfo(fileName).content.length;
    }

    public getScriptId(fileName: string): string {
      return this.getScriptInfo(fileName).fileName;
    }

    public getScriptIsResident(fileName: string): bool {
      return this.getScriptInfo(fileName).isOpen;
    }

    public getScriptVersion(fileName: string): number {
      return this.getScriptInfo(fileName).version;
    }

      public getScriptSnapshot(fileName: string): TypeScript.IScriptSnapshot {
	  return new Snapshot(this.getScriptInfo(fileName).content);
      }

      public getScriptEditRangeSinceVersion(fileName: string, scriptVersion: number): TypeScript.TextChangeRange {
	  var script = this.getScriptInfo(fileName);
	return script.getTextChangeRangeBetweenVersions(scriptVersion, 
							script.version);
    }

    //
    // Return a new instance of the language service shim, up-to-date wrt to typecheck.
    // To access the non-shim (i.e. actual) language service, use the "ls.languageService" property.
    //
    public getLanguageService(): Services.ILanguageService {
      // var ls = new Services.TypeScriptServicesFactory().createLanguageServiceShim(this);
      var ls = new Services.TypeScriptServicesFactory().createPullLanguageService(this);
      ls.refresh();
      this.ls = ls;
      return ls;
    }

    //
    // Parse file given its source text
    //
    public parseSourceText(fileName: string, sourceText: TypeScript.IScriptSnapshot): TypeScript.Script {
            var compilationSettings = new TypeScript.CompilationSettings();
            var parseOptions = TypeScript.getParseOptions(compilationSettings);
            return TypeScript.SyntaxTreeToAstVisitor.visit(
                TypeScript.Parser.parse(fileName, 
					TypeScript.SimpleText.fromScriptSnapshot(sourceText), 
					TypeScript.isDTSFile(fileName), 
					TypeScript.LanguageVersion.EcmaScript5, 
					parseOptions),
                fileName, compilationSettings);
    }

      public getDiagnosticsObject(): Services.ILanguageServicesDiagnostics {
            return new LanguageServicesDiagnostics("");
        }

    //
    // line and column are 1-based
    //
      public lineColToPosition(fileName: string, line: number, col: number): number {
            var script: ScriptInfo = this.fileNameToScript.lookup(fileName);
            assert.notNull(script);
            assert(line >= 1);
            assert(col >= 1);

            return script.lineMap.getPosition(line - 1, col - 1);
        }

    //
    // line and column are 1-based
    //
    public positionToLineCol(fileName: string, position: number): TypeScript.LineAndCharacter {
      var script: ScriptInfo = this.fileNameToScript.lookup(fileName);
      assert.notNull(script);

      var result = script.lineMap.getLineAndCharacterFromPosition(position);

	assert(result.line() >= 1);
	assert(result.character() >= 1);
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
