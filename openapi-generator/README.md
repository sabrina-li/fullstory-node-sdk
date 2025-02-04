# OpenAPI Generator for the fullstory-typescript library

## Overview
This is [created from the boiler-plate project](https://openapi-generator.tech/docs/customization#custom-generator-and-template) to generate TypeScript code derived from our swagger specification.
Its goal is to get started with the basic plumbing so any custom logic needed can be put into place.

## What's OpenAPI
The goal of OpenAPI is to define a standard, language-agnostic interface to REST APIs which allows both humans and computers to discover and understand the capabilities of the service without access to source code, documentation, or through network traffic inspection.
When properly described with OpenAPI, a consumer can understand and interact with the remote service with a minimal amount of implementation logic.
Similar to what interfaces have done for lower-level programming, OpenAPI removes the guesswork in calling the service.

Check out [OpenAPI-Spec](https://github.com/OAI/OpenAPI-Specification) for additional information about the OpenAPI project, including additional libraries with support for other languages and more.

## How do I use this?
At this point, the generator is setup to have minimal logic to generate TypeScript Client code.

```
. // current folder (openapi-generator)
|- README.md    // this file
|- pom.xml      // build script
|-- src
|--- main
|---- java
|----- com.fullstory.typescript.FullstoryTypescriptGenerator.java // generator file
|---- resources
|----- fullstory-typescript // template files
|----- META-INF
|------ services
|------- org.openapitools.codegen.CodegenConfig
```

To make changes in the generator:

`src/main/java/com/fullstory/typescript/FullstoryTypescriptGenerator.java`

To make changes to the templates:

`src/main/resources/fullstory-typescript`

Once modified, you can run the following commend _from the root_:

```
make gen-openapi
```

This will re-build the generator, A single jar file will be produced in `target` folder.
The command also generates the TypeScript files into the appropriate place in the `src` folder.

## How do I modify this?
The `FullstoryTypescriptGenerator` class,  in `FullstoryTypescriptGenerator.java`, extends the `org.openapitools.codegen.languages.AbstractTypeScriptClientCodegen` class.
Which in turn extends `DefaultCodegen`and implements `CodegenConfig`.
Read the code in the super class and interface to understand the logic. A good example of TypeScript Client generator, and what we will likely borrow some logic from, is the `org.openapitools.codegen.languages.TypeScriptNodeClientCodegen` class.

There is also a test `FullstoryTypescriptGeneratorTest.java`. You can step through the code in a debugger by debugging the test.

There are a number of debugging data and messages available to be printed out.
You can execute the `java` command from above while passing different debug flags to show the object you have available during client generation:

```shell
# The following additional debug options are available for all codegen targets:
# -DdebugOpenAPI prints the OpenAPI Specification as interpreted by the codegen
# -DdebugModels prints models passed to the template engine
# -DdebugOperations prints operations passed to the template engine
# -DdebugSupportingFiles prints additional data passed to the template engine

# For example, the following command outputs the debug info for "models".
# You can use this info in the "model.mustache" file.
java -DdebugModels -cp 
openapi-generator/target/fullstory-typescript-openapi-generator-1.0.0.jar:node_modules/@openapitools/openapi-generator-cli/versions/$(OPENAPI_GEN_VERSION).jar \
org.openapitools.codegen.OpenAPIGenerator \
generate -g fullstory-typescript -i /path/to/openapi.yaml -o ./test
```

## Where are the specifications from?
The `users.swagger.json` file is generated by FullStory that contains the specifications of the FullStory server APIs supported by this client SDK.
Please do not edit (unless you are a FullStory developer).
There are plans to synchronize the spec file in a more [bionic](https://www.fullstory.com/blog/watchwords-empathy-clarity-bionics/) process. But for now this file is manually copied inside this project.

## Where are the generated code?
At the moment, no APIs or supporting files are generated yet: only models are generated.
All the models inside `<root>/src/model` are automatically generated.

See `<root>/.openapi-generator/FILES` contains a list of all files. 

See `<root>/.openapi-generator-ignore` for allowing any non-generated files to live inside the same folder.