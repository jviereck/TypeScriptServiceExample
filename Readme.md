# TypeScriptServices example

The [TypeScript](http://www.typescriptlang.org/) source has all the goodies
required to integrate TypeScript into an IDE (get AST, type informations, completion, ...).

This is a small demo using some of stuff shipping with the TypeScript repo. You can view the demo [here](http://jviereck.github.com/TypeScriptServiceExample/).

To build the `ServiceBuilder.js` file, checkout the TypeScript repo

```
git clone https://git01.codeplex.com/typescript ts
```

install the TypeScriptCompiler

```
npm install -g typescript
```

and then execute from this directory

```
tsc ServiceBuilder.ts --out ServiceBuilder.js
```