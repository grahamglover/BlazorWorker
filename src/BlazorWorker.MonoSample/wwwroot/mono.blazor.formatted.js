var Module = typeof Module !== "undefined" ? Module : {};
var moduleOverrides = {};
var key;
for (key in Module) {
    if (Module.hasOwnProperty(key)) {
        moduleOverrides[key] = Module[key]
    }
}
Module["arguments"] = [];
Module["thisProgram"] = "./this.program";
Module["quit"] = function(status, toThrow) {
    throw toThrow
}
;
Module["preRun"] = [];
Module["postRun"] = [];
var ENVIRONMENT_IS_WEB = false;
var ENVIRONMENT_IS_WORKER = false;
var ENVIRONMENT_IS_NODE = false;
var ENVIRONMENT_HAS_NODE = false;
var ENVIRONMENT_IS_SHELL = false;
ENVIRONMENT_IS_WEB = typeof window === "object";
ENVIRONMENT_IS_WORKER = typeof importScripts === "function";
ENVIRONMENT_HAS_NODE = typeof process === "object" && typeof process.versions === "object" && typeof process.versions.node === "string";
ENVIRONMENT_IS_NODE = ENVIRONMENT_HAS_NODE && !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_WORKER;
ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;
var scriptDirectory = "";
function locateFile(path) {
    if (Module["locateFile"]) {
        return Module["locateFile"](path, scriptDirectory)
    } else {
        return scriptDirectory + path
    }
}
if (ENVIRONMENT_IS_NODE) {
    scriptDirectory = __dirname + "/";
    var nodeFS;
    var nodePath;
    Module["read"] = function shell_read(filename, binary) {
        var ret;
        if (!nodeFS)
            nodeFS = require("fs");
        if (!nodePath)
            nodePath = require("path");
        filename = nodePath["normalize"](filename);
        ret = nodeFS["readFileSync"](filename);
        return binary ? ret : ret.toString()
    }
    ;
    Module["readBinary"] = function readBinary(filename) {
        var ret = Module["read"](filename, true);
        if (!ret.buffer) {
            ret = new Uint8Array(ret)
        }
        assert(ret.buffer);
        return ret
    }
    ;
    if (process["argv"].length > 1) {
        Module["thisProgram"] = process["argv"][1].replace(/\\/g, "/")
    }
    Module["arguments"] = process["argv"].slice(2);
    if (typeof module !== "undefined") {
        module["exports"] = Module
    }
    process["on"]("uncaughtException", function(ex) {
        if (!(ex instanceof ExitStatus)) {
            throw ex
        }
    });
    process["on"]("unhandledRejection", abort);
    Module["quit"] = function(status) {
        process["exit"](status)
    }
    ;
    Module["inspect"] = function() {
        return "[Emscripten Module object]"
    }
} else if (ENVIRONMENT_IS_SHELL) {
    if (typeof read != "undefined") {
        Module["read"] = function shell_read(f) {
            return read(f)
        }
    }
    Module["readBinary"] = function readBinary(f) {
        var data;
        if (typeof readbuffer === "function") {
            return new Uint8Array(readbuffer(f))
        }
        data = read(f, "binary");
        assert(typeof data === "object");
        return data
    }
    ;
    if (typeof scriptArgs != "undefined") {
        Module["arguments"] = scriptArgs
    } else if (typeof arguments != "undefined") {
        Module["arguments"] = arguments
    }
    if (typeof quit === "function") {
        Module["quit"] = function(status) {
            quit(status)
        }
    }
} else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
    if (ENVIRONMENT_IS_WORKER) {
        scriptDirectory = self.location.href
    } else if (document.currentScript) {
        scriptDirectory = document.currentScript.src
    }
    if (scriptDirectory.indexOf("blob:") !== 0) {
        scriptDirectory = scriptDirectory.substr(0, scriptDirectory.lastIndexOf("/") + 1)
    } else {
        scriptDirectory = ""
    }
    Module["read"] = function shell_read(url) {
        var xhr = new XMLHttpRequest;
        xhr.open("GET", url, false);
        xhr.send(null);
        return xhr.responseText
    }
    ;
    if (ENVIRONMENT_IS_WORKER) {
        Module["readBinary"] = function readBinary(url) {
            var xhr = new XMLHttpRequest;
            xhr.open("GET", url, false);
            xhr.responseType = "arraybuffer";
            xhr.send(null);
            return new Uint8Array(xhr.response)
        }
    }
    Module["readAsync"] = function readAsync(url, onload, onerror) {
        var xhr = new XMLHttpRequest;
        xhr.open("GET", url, true);
        xhr.responseType = "arraybuffer";
        xhr.onload = function xhr_onload() {
            if (xhr.status == 200 || xhr.status == 0 && xhr.response) {
                onload(xhr.response);
                return
            }
            onerror()
        }
        ;
        xhr.onerror = onerror;
        xhr.send(null)
    }
    ;
    Module["setWindowTitle"] = function(title) {
        document.title = title
    }
} else {}
var out = Module["print"] || (typeof console !== "undefined" ? console.log.bind(console) : typeof print !== "undefined" ? print : null);
var err = Module["printErr"] || (typeof printErr !== "undefined" ? printErr : typeof console !== "undefined" && console.warn.bind(console) || out);
for (key in moduleOverrides) {
    if (moduleOverrides.hasOwnProperty(key)) {
        Module[key] = moduleOverrides[key]
    }
}
moduleOverrides = undefined;
function dynamicAlloc(size) {
    var ret = HEAP32[DYNAMICTOP_PTR >> 2];
    var end = ret + size + 15 & -16;
    if (end > _emscripten_get_heap_size()) {
        abort()
    }
    HEAP32[DYNAMICTOP_PTR >> 2] = end;
    return ret
}
function getNativeTypeSize(type) {
    switch (type) {
    case "i1":
    case "i8":
        return 1;
    case "i16":
        return 2;
    case "i32":
        return 4;
    case "i64":
        return 8;
    case "float":
        return 4;
    case "double":
        return 8;
    default:
        {
            if (type[type.length - 1] === "*") {
                return 4
            } else if (type[0] === "i") {
                var bits = parseInt(type.substr(1));
                assert(bits % 8 === 0, "getNativeTypeSize invalid bits " + bits + ", type " + type);
                return bits / 8
            } else {
                return 0
            }
        }
    }
}
function convertJsFunctionToWasm(func, sig) {
    var typeSection = [1, 0, 1, 96];
    var sigRet = sig.slice(0, 1);
    var sigParam = sig.slice(1);
    var typeCodes = {
        "i": 127,
        "j": 126,
        "f": 125,
        "d": 124
    };
    typeSection.push(sigParam.length);
    for (var i = 0; i < sigParam.length; ++i) {
        typeSection.push(typeCodes[sigParam[i]])
    }
    if (sigRet == "v") {
        typeSection.push(0)
    } else {
        typeSection = typeSection.concat([1, typeCodes[sigRet]])
    }
    typeSection[1] = typeSection.length - 2;
    var bytes = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0].concat(typeSection, [2, 7, 1, 1, 101, 1, 102, 0, 0, 7, 5, 1, 1, 102, 0, 0]));
    var module = new WebAssembly.Module(bytes);
    var instance = new WebAssembly.Instance(module,{
        e: {
            f: func
        }
    });
    var wrappedFunc = instance.exports.f;
    return wrappedFunc
}
function addFunctionWasm(func, sig) {
    var table = wasmTable;
    var ret = table.length;
    try {
        table.grow(1)
    } catch (err) {
        if (!err instanceof RangeError) {
            throw err
        }
        throw "Unable to grow wasm table. Use a higher value for RESERVED_FUNCTION_POINTERS or set ALLOW_TABLE_GROWTH."
    }
    try {
        table.set(ret, func)
    } catch (err) {
        if (!err instanceof TypeError) {
            throw err
        }
        assert(typeof sig !== "undefined", "Missing signature argument to addFunction");
        var wrapped = convertJsFunctionToWasm(func, sig);
        table.set(ret, wrapped)
    }
    return ret
}
function addFunction(func, sig) {
    return addFunctionWasm(func, sig)
}
var tempRet0 = 0;
var setTempRet0 = function(value) {
    tempRet0 = value
};
var getTempRet0 = function() {
    return tempRet0
};
if (typeof WebAssembly !== "object") {
    err("no native wasm support detected")
}
function setValue(ptr, value, type, noSafe) {
    type = type || "i8";
    if (type.charAt(type.length - 1) === "*")
        type = "i32";
    switch (type) {
    case "i1":
        HEAP8[ptr >> 0] = value;
        break;
    case "i8":
        HEAP8[ptr >> 0] = value;
        break;
    case "i16":
        HEAP16[ptr >> 1] = value;
        break;
    case "i32":
        HEAP32[ptr >> 2] = value;
        break;
    case "i64":
        tempI64 = [value >>> 0, (tempDouble = value,
        +Math_abs(tempDouble) >= 1 ? tempDouble > 0 ? (Math_min(+Math_floor(tempDouble / 4294967296), 4294967295) | 0) >>> 0 : ~~+Math_ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>> 0 : 0)],
        HEAP32[ptr >> 2] = tempI64[0],
        HEAP32[ptr + 4 >> 2] = tempI64[1];
        break;
    case "float":
        HEAPF32[ptr >> 2] = value;
        break;
    case "double":
        HEAPF64[ptr >> 3] = value;
        break;
    default:
        abort("invalid type for setValue: " + type)
    }
}
function getValue(ptr, type, noSafe) {
    type = type || "i8";
    if (type.charAt(type.length - 1) === "*")
        type = "i32";
    switch (type) {
    case "i1":
        return HEAP8[ptr >> 0];
    case "i8":
        return HEAP8[ptr >> 0];
    case "i16":
        return HEAP16[ptr >> 1];
    case "i32":
        return HEAP32[ptr >> 2];
    case "i64":
        return HEAP32[ptr >> 2];
    case "float":
        return HEAPF32[ptr >> 2];
    case "double":
        return HEAPF64[ptr >> 3];
    default:
        abort("invalid type for getValue: " + type)
    }
    return null
}
var wasmMemory;
var wasmTable;
var ABORT = false;
var EXITSTATUS = 0;
function assert(condition, text) {
    if (!condition) {
        abort("Assertion failed: " + text)
    }
}
function getCFunc(ident) {
    var func = Module["_" + ident];
    assert(func, "Cannot call unknown function " + ident + ", make sure it is exported");
    return func
}
function ccall(ident, returnType, argTypes, args, opts) {
    var toC = {
        "string": function(str) {
            var ret = 0;
            if (str !== null && str !== undefined && str !== 0) {
                var len = (str.length << 2) + 1;
                ret = stackAlloc(len);
                stringToUTF8(str, ret, len)
            }
            return ret
        },
        "array": function(arr) {
            var ret = stackAlloc(arr.length);
            writeArrayToMemory(arr, ret);
            return ret
        }
    };
    function convertReturnValue(ret) {
        if (returnType === "string")
            return UTF8ToString(ret);
        if (returnType === "boolean")
            return Boolean(ret);
        return ret
    }
    var func = getCFunc(ident);
    var cArgs = [];
    var stack = 0;
    if (args) {
        for (var i = 0; i < args.length; i++) {
            var converter = toC[argTypes[i]];
            if (converter) {
                if (stack === 0)
                    stack = stackSave();
                cArgs[i] = converter(args[i])
            } else {
                cArgs[i] = args[i]
            }
        }
    }
    var ret = func.apply(null, cArgs);
    ret = convertReturnValue(ret);
    if (stack !== 0)
        stackRestore(stack);
    return ret
}
function cwrap(ident, returnType, argTypes, opts) {
    argTypes = argTypes || [];
    var numericArgs = argTypes.every(function(type) {
        return type === "number"
    });
    var numericRet = returnType !== "string";
    if (numericRet && numericArgs && !opts) {
        return getCFunc(ident)
    }
    return function() {
        return ccall(ident, returnType, argTypes, arguments, opts)
    }
}
var ALLOC_NORMAL = 0;
var ALLOC_NONE = 3;
function allocate(slab, types, allocator, ptr) {
    var zeroinit, size;
    if (typeof slab === "number") {
        zeroinit = true;
        size = slab
    } else {
        zeroinit = false;
        size = slab.length
    }
    var singleType = typeof types === "string" ? types : null;
    var ret;
    if (allocator == ALLOC_NONE) {
        ret = ptr
    } else {
        ret = [_malloc, stackAlloc, dynamicAlloc][allocator](Math.max(size, singleType ? 1 : types.length))
    }
    if (zeroinit) {
        var stop;
        ptr = ret;
        assert((ret & 3) == 0);
        stop = ret + (size & ~3);
        for (; ptr < stop; ptr += 4) {
            HEAP32[ptr >> 2] = 0
        }
        stop = ret + size;
        while (ptr < stop) {
            HEAP8[ptr++ >> 0] = 0
        }
        return ret
    }
    if (singleType === "i8") {
        if (slab.subarray || slab.slice) {
            HEAPU8.set(slab, ret)
        } else {
            HEAPU8.set(new Uint8Array(slab), ret)
        }
        return ret
    }
    var i = 0, type, typeSize, previousType;
    while (i < size) {
        var curr = slab[i];
        type = singleType || types[i];
        if (type === 0) {
            i++;
            continue
        }
        if (type == "i64")
            type = "i32";
        setValue(ret + i, curr, type);
        if (previousType !== type) {
            typeSize = getNativeTypeSize(type);
            previousType = type
        }
        i += typeSize
    }
    return ret
}
function getMemory(size) {
    if (!runtimeInitialized)
        return dynamicAlloc(size);
    return _malloc(size)
}
function AsciiToString(ptr) {
    var str = "";
    while (1) {
        var ch = HEAPU8[ptr++ >> 0];
        if (!ch)
            return str;
        str += String.fromCharCode(ch)
    }
}
var UTF8Decoder = typeof TextDecoder !== "undefined" ? new TextDecoder("utf8") : undefined;
function UTF8ArrayToString(u8Array, idx, maxBytesToRead) {
    var endIdx = idx + maxBytesToRead;
    var endPtr = idx;
    while (u8Array[endPtr] && !(endPtr >= endIdx))
        ++endPtr;
    if (endPtr - idx > 16 && u8Array.subarray && UTF8Decoder) {
        return UTF8Decoder.decode(u8Array.subarray(idx, endPtr))
    } else {
        var str = "";
        while (idx < endPtr) {
            var u0 = u8Array[idx++];
            if (!(u0 & 128)) {
                str += String.fromCharCode(u0);
                continue
            }
            var u1 = u8Array[idx++] & 63;
            if ((u0 & 224) == 192) {
                str += String.fromCharCode((u0 & 31) << 6 | u1);
                continue
            }
            var u2 = u8Array[idx++] & 63;
            if ((u0 & 240) == 224) {
                u0 = (u0 & 15) << 12 | u1 << 6 | u2
            } else {
                u0 = (u0 & 7) << 18 | u1 << 12 | u2 << 6 | u8Array[idx++] & 63
            }
            if (u0 < 65536) {
                str += String.fromCharCode(u0)
            } else {
                var ch = u0 - 65536;
                str += String.fromCharCode(55296 | ch >> 10, 56320 | ch & 1023)
            }
        }
    }
    return str
}
function UTF8ToString(ptr, maxBytesToRead) {
    return ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead) : ""
}
function stringToUTF8Array(str, outU8Array, outIdx, maxBytesToWrite) {
    if (!(maxBytesToWrite > 0))
        return 0;
    var startIdx = outIdx;
    var endIdx = outIdx + maxBytesToWrite - 1;
    for (var i = 0; i < str.length; ++i) {
        var u = str.charCodeAt(i);
        if (u >= 55296 && u <= 57343) {
            var u1 = str.charCodeAt(++i);
            u = 65536 + ((u & 1023) << 10) | u1 & 1023
        }
        if (u <= 127) {
            if (outIdx >= endIdx)
                break;
            outU8Array[outIdx++] = u
        } else if (u <= 2047) {
            if (outIdx + 1 >= endIdx)
                break;
            outU8Array[outIdx++] = 192 | u >> 6;
            outU8Array[outIdx++] = 128 | u & 63
        } else if (u <= 65535) {
            if (outIdx + 2 >= endIdx)
                break;
            outU8Array[outIdx++] = 224 | u >> 12;
            outU8Array[outIdx++] = 128 | u >> 6 & 63;
            outU8Array[outIdx++] = 128 | u & 63
        } else {
            if (outIdx + 3 >= endIdx)
                break;
            outU8Array[outIdx++] = 240 | u >> 18;
            outU8Array[outIdx++] = 128 | u >> 12 & 63;
            outU8Array[outIdx++] = 128 | u >> 6 & 63;
            outU8Array[outIdx++] = 128 | u & 63
        }
    }
    outU8Array[outIdx] = 0;
    return outIdx - startIdx
}
function stringToUTF8(str, outPtr, maxBytesToWrite) {
    return stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite)
}
function lengthBytesUTF8(str) {
    var len = 0;
    for (var i = 0; i < str.length; ++i) {
        var u = str.charCodeAt(i);
        if (u >= 55296 && u <= 57343)
            u = 65536 + ((u & 1023) << 10) | str.charCodeAt(++i) & 1023;
        if (u <= 127)
            ++len;
        else if (u <= 2047)
            len += 2;
        else if (u <= 65535)
            len += 3;
        else
            len += 4
    }
    return len
}
var UTF16Decoder = typeof TextDecoder !== "undefined" ? new TextDecoder("utf-16le") : undefined;
function stringToUTF16(str, outPtr, maxBytesToWrite) {
    if (maxBytesToWrite === undefined) {
        maxBytesToWrite = 2147483647
    }
    if (maxBytesToWrite < 2)
        return 0;
    maxBytesToWrite -= 2;
    var startPtr = outPtr;
    var numCharsToWrite = maxBytesToWrite < str.length * 2 ? maxBytesToWrite / 2 : str.length;
    for (var i = 0; i < numCharsToWrite; ++i) {
        var codeUnit = str.charCodeAt(i);
        HEAP16[outPtr >> 1] = codeUnit;
        outPtr += 2
    }
    HEAP16[outPtr >> 1] = 0;
    return outPtr - startPtr
}
function allocateUTF8(str) {
    var size = lengthBytesUTF8(str) + 1;
    var ret = _malloc(size);
    if (ret)
        stringToUTF8Array(str, HEAP8, ret, size);
    return ret
}
function writeArrayToMemory(array, buffer) {
    HEAP8.set(array, buffer)
}
function writeAsciiToMemory(str, buffer, dontAddNull) {
    for (var i = 0; i < str.length; ++i) {
        HEAP8[buffer++ >> 0] = str.charCodeAt(i)
    }
    if (!dontAddNull)
        HEAP8[buffer >> 0] = 0
}
function demangle(func) {
    return func
}
function demangleAll(text) {
    var regex = /_Z[\w\d_]+/g;
    return text.replace(regex, function(x) {
        var y = demangle(x);
        return x === y ? x : y + " [" + x + "]"
    })
}
function jsStackTrace() {
    var err = new Error;
    if (!err.stack) {
        try {
            throw new Error(0)
        } catch (e) {
            err = e
        }
        if (!err.stack) {
            return "(no stack trace available)"
        }
    }
    return err.stack.toString()
}
function stackTrace() {
    var js = jsStackTrace();
    if (Module["extraStackTrace"])
        js += "\n" + Module["extraStackTrace"]();
    return demangleAll(js)
}
var PAGE_SIZE = 16384;
var WASM_PAGE_SIZE = 65536;
function alignUp(x, multiple) {
    if (x % multiple > 0) {
        x += multiple - x % multiple
    }
    return x
}
var buffer, HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;
function updateGlobalBufferViews() {
    Module["HEAP8"] = HEAP8 = new Int8Array(buffer);
    Module["HEAP16"] = HEAP16 = new Int16Array(buffer);
    Module["HEAP32"] = HEAP32 = new Int32Array(buffer);
    Module["HEAPU8"] = HEAPU8 = new Uint8Array(buffer);
    Module["HEAPU16"] = HEAPU16 = new Uint16Array(buffer);
    Module["HEAPU32"] = HEAPU32 = new Uint32Array(buffer);
    Module["HEAPF32"] = HEAPF32 = new Float32Array(buffer);
    Module["HEAPF64"] = HEAPF64 = new Float64Array(buffer)
}
var STACK_MAX = 737456
  , DYNAMIC_BASE = 5980336
  , DYNAMICTOP_PTR = 737424;
var TOTAL_STACK = 5242880;
var INITIAL_TOTAL_MEMORY = Module["TOTAL_MEMORY"] || 16777216;
if (INITIAL_TOTAL_MEMORY < TOTAL_STACK)
    err("TOTAL_MEMORY should be larger than TOTAL_STACK, was " + INITIAL_TOTAL_MEMORY + "! (TOTAL_STACK=" + TOTAL_STACK + ")");
if (Module["wasmMemory"]) {
    wasmMemory = Module["wasmMemory"]
} else {
    wasmMemory = new WebAssembly.Memory({
        "initial": INITIAL_TOTAL_MEMORY / WASM_PAGE_SIZE
    })
}
if (wasmMemory) {
    buffer = wasmMemory.buffer
}
INITIAL_TOTAL_MEMORY = buffer.byteLength;
updateGlobalBufferViews();
HEAP32[DYNAMICTOP_PTR >> 2] = DYNAMIC_BASE;
function callRuntimeCallbacks(callbacks) {
    while (callbacks.length > 0) {
        var callback = callbacks.shift();
        if (typeof callback == "function") {
            callback();
            continue
        }
        var func = callback.func;
        if (typeof func === "number") {
            if (callback.arg === undefined) {
                Module["dynCall_v"](func)
            } else {
                Module["dynCall_vi"](func, callback.arg)
            }
        } else {
            func(callback.arg === undefined ? null : callback.arg)
        }
    }
}
var __ATPRERUN__ = [];
var __ATINIT__ = [];
var __ATMAIN__ = [];
var __ATEXIT__ = [];
var __ATPOSTRUN__ = [];
var runtimeInitialized = false;
var runtimeExited = false;
function preRun() {
    if (Module["preRun"]) {
        if (typeof Module["preRun"] == "function")
            Module["preRun"] = [Module["preRun"]];
        while (Module["preRun"].length) {
            addOnPreRun(Module["preRun"].shift())
        }
    }
    callRuntimeCallbacks(__ATPRERUN__)
}
function initRuntime() {
    runtimeInitialized = true;
    if (!Module["noFSInit"] && !FS.init.initialized)
        FS.init();
    TTY.init();
    SOCKFS.root = FS.mount(SOCKFS, {}, null);
    PIPEFS.root = FS.mount(PIPEFS, {}, null);
    callRuntimeCallbacks(__ATINIT__)
}
function preMain() {
    FS.ignorePermissions = false;
    callRuntimeCallbacks(__ATMAIN__)
}
function exitRuntime() {
    runtimeExited = true
}
function postRun() {
    if (Module["postRun"]) {
        if (typeof Module["postRun"] == "function")
            Module["postRun"] = [Module["postRun"]];
        while (Module["postRun"].length) {
            addOnPostRun(Module["postRun"].shift())
        }
    }
    callRuntimeCallbacks(__ATPOSTRUN__)
}
function addOnPreRun(cb) {
    __ATPRERUN__.unshift(cb)
}
function addOnPostRun(cb) {
    __ATPOSTRUN__.unshift(cb)
}
var Math_abs = Math.abs;
var Math_sqrt = Math.sqrt;
var Math_ceil = Math.ceil;
var Math_floor = Math.floor;
var Math_min = Math.min;
var runDependencies = 0;
var runDependencyWatcher = null;
var dependenciesFulfilled = null;
function getUniqueRunDependency(id) {
    return id
}
function addRunDependency(id) {
    runDependencies++;
    if (Module["monitorRunDependencies"]) {
        Module["monitorRunDependencies"](runDependencies)
    }
}
function removeRunDependency(id) {
    runDependencies--;
    if (Module["monitorRunDependencies"]) {
        Module["monitorRunDependencies"](runDependencies)
    }
    if (runDependencies == 0) {
        if (runDependencyWatcher !== null) {
            clearInterval(runDependencyWatcher);
            runDependencyWatcher = null
        }
        if (dependenciesFulfilled) {
            var callback = dependenciesFulfilled;
            dependenciesFulfilled = null;
            callback()
        }
    }
}
Module["preloadedImages"] = {};
Module["preloadedAudios"] = {};
var dataURIPrefix = "data:application/octet-stream;base64,";
function isDataURI(filename) {
    return String.prototype.startsWith ? filename.startsWith(dataURIPrefix) : filename.indexOf(dataURIPrefix) === 0
}
var wasmBinaryFile = "mono.wasm";
if (!isDataURI(wasmBinaryFile)) {
    wasmBinaryFile = locateFile(wasmBinaryFile)
}
function getBinary() {
    try {
        if (Module["wasmBinary"]) {
            return new Uint8Array(Module["wasmBinary"])
        }
        if (Module["readBinary"]) {
            return Module["readBinary"](wasmBinaryFile)
        } else {
            throw "both async and sync fetching of the wasm failed"
        }
    } catch (err) {
        abort(err)
    }
}
function getBinaryPromise() {
    if (!Module["wasmBinary"] && (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) && typeof fetch === "function") {
        return fetch(wasmBinaryFile, {
            credentials: "same-origin"
        }).then(function(response) {
            if (!response["ok"]) {
                throw "failed to load wasm binary file at '" + wasmBinaryFile + "'"
            }
            return response["arrayBuffer"]()
        }).catch(function() {
            return getBinary()
        })
    }
    return new Promise(function(resolve, reject) {
        resolve(getBinary())
    }
    )
}
function createWasm(env) {
    var info = {
        "env": env
    };
    function receiveInstance(instance, module) {
        var exports = instance.exports;
        Module["asm"] = exports;
        removeRunDependency("wasm-instantiate")
    }
    addRunDependency("wasm-instantiate");
    function receiveInstantiatedSource(output) {
        receiveInstance(output["instance"])
    }
    function instantiateArrayBuffer(receiver) {
        return getBinaryPromise().then(function(binary) {
            return WebAssembly.instantiate(binary, info)
        }).then(receiver, function(reason) {
            err("failed to asynchronously prepare wasm: " + reason);
            abort(reason)
        })
    }
    function instantiateAsync() {
        if (!Module["wasmBinary"] && typeof WebAssembly.instantiateStreaming === "function" && !isDataURI(wasmBinaryFile) && typeof fetch === "function") {
            fetch(wasmBinaryFile, {
                credentials: "same-origin"
            }).then(function(response) {
                return WebAssembly.instantiateStreaming(response, info).then(receiveInstantiatedSource, function(reason) {
                    err("wasm streaming compile failed: " + reason);
                    err("falling back to ArrayBuffer instantiation");
                    instantiateArrayBuffer(receiveInstantiatedSource)
                })
            })
        } else {
            return instantiateArrayBuffer(receiveInstantiatedSource)
        }
    }
    if (Module["instantiateWasm"]) {
        try {
            return Module["instantiateWasm"](info, receiveInstance)
        } catch (e) {
            err("Module.instantiateWasm callback failed with error: " + e);
            return false
        }
    }
    instantiateAsync();
    return {}
}
Module["asm"] = function(global, env, providedBuffer) {
    env["memory"] = wasmMemory;
    env["table"] = wasmTable = new WebAssembly.Table({
        "initial": 1695,
        "maximum": 1695 + 0,
        "element": "anyfunc"
    });
    var exports = createWasm(env);
    return exports
}
;
var ASM_CONSTS = [function($0, $1) {
    var str = UTF8ToString($0);
    try {
        var res = eval(str);
        if (res === null || res == undefined)
            return 0;
        res = res.toString();
        setValue($1, 0, "i32")
    } catch (e) {
        res = e.toString();
        setValue($1, 1, "i32");
        if (res === null || res === undefined)
            res = "unknown exception"
    }
    var buff = Module._malloc((res.length + 1) * 2);
    stringToUTF16(res, buff, (res.length + 1) * 2);
    return buff
}
, function() {
    var err = new Error;
    console.log("Stacktrace: \n");
    console.log(err.stack)
}
, function() {
    return STACK_MAX
}
, function() {
    return TOTAL_STACK
}
];
function _emscripten_asm_const_iii(code, sig_ptr, argbuf) {
    var sig = AsciiToString(sig_ptr);
    var args = [];
    var align_to = function(ptr, align) {
        return ptr + align - 1 & ~(align - 1)
    };
    var buf = argbuf;
    for (var i = 0; i < sig.length; i++) {
        var c = sig[i];
        if (c == "d" || c == "f") {
            buf = align_to(buf, 8);
            args.push(HEAPF64[buf >> 3]);
            buf += 8
        } else if (c == "i") {
            buf = align_to(buf, 4);
            args.push(HEAP32[buf >> 2]);
            buf += 4
        }
    }
    return ASM_CONSTS[code].apply(null, args)
}
__ATINIT__.push({
    func: function() {
        ___wasm_call_ctors()
    }
});
function ___assert_fail(condition, filename, line, func) {
    abort("Assertion failed: " + UTF8ToString(condition) + ", at: " + [filename ? UTF8ToString(filename) : "unknown filename", line, func ? UTF8ToString(func) : "unknown function"])
}
var ENV = {};
function ___buildEnvironment(environ) {
    var MAX_ENV_VALUES = 64;
    var TOTAL_ENV_SIZE = 1024;
    var poolPtr;
    var envPtr;
    if (!___buildEnvironment.called) {
        ___buildEnvironment.called = true;
        ENV["USER"] = ENV["LOGNAME"] = "web_user";
        ENV["PATH"] = "/";
        ENV["PWD"] = "/";
        ENV["HOME"] = "/home/web_user";
        ENV["LANG"] = "C.UTF-8";
        ENV["LANG"] = (typeof navigator === "object" && navigator.languages && navigator.languages[0] || "C").replace("-", "_") + ".UTF-8";
        ENV["_"] = Module["thisProgram"];
        poolPtr = getMemory(TOTAL_ENV_SIZE);
        envPtr = getMemory(MAX_ENV_VALUES * 4);
        HEAP32[envPtr >> 2] = poolPtr;
        HEAP32[environ >> 2] = envPtr
    } else {
        envPtr = HEAP32[environ >> 2];
        poolPtr = HEAP32[envPtr >> 2]
    }
    var strings = [];
    var totalSize = 0;
    for (var key in ENV) {
        if (typeof ENV[key] === "string") {
            var line = key + "=" + ENV[key];
            strings.push(line);
            totalSize += line.length
        }
    }
    if (totalSize > TOTAL_ENV_SIZE) {
        throw new Error("Environment size exceeded TOTAL_ENV_SIZE!")
    }
    var ptrSize = 4;
    for (var i = 0; i < strings.length; i++) {
        var line = strings[i];
        writeAsciiToMemory(line, poolPtr);
        HEAP32[envPtr + i * ptrSize >> 2] = poolPtr;
        poolPtr += line.length + 1
    }
    HEAP32[envPtr + strings.length * ptrSize >> 2] = 0
}
function _emscripten_get_now() {
    abort()
}
function _emscripten_get_now_is_monotonic() {
    return 0 || ENVIRONMENT_IS_NODE || typeof dateNow !== "undefined" || typeof performance === "object" && performance && typeof performance["now"] === "function"
}
function ___setErrNo(value) {
    if (Module["___errno_location"])
        HEAP32[Module["___errno_location"]() >> 2] = value;
    return value
}
function _clock_gettime(clk_id, tp) {
    var now;
    if (clk_id === 0) {
        now = Date.now()
    } else if (clk_id === 1 && _emscripten_get_now_is_monotonic()) {
        now = _emscripten_get_now()
    } else {
        ___setErrNo(22);
        return -1
    }
    HEAP32[tp >> 2] = now / 1e3 | 0;
    HEAP32[tp + 4 >> 2] = now % 1e3 * 1e3 * 1e3 | 0;
    return 0
}
function ___clock_gettime(a0, a1) {
    return _clock_gettime(a0, a1)
}
function ___cxa_allocate_exception(size) {
    return _malloc(size)
}
var ___exception_infos = {};
var ___exception_caught = [];
function ___exception_addRef(ptr) {
    if (!ptr)
        return;
    var info = ___exception_infos[ptr];
    info.refcount++
}
function ___exception_deAdjust(adjusted) {
    if (!adjusted || ___exception_infos[adjusted])
        return adjusted;
    for (var key in ___exception_infos) {
        var ptr = +key;
        var adj = ___exception_infos[ptr].adjusted;
        var len = adj.length;
        for (var i = 0; i < len; i++) {
            if (adj[i] === adjusted) {
                return ptr
            }
        }
    }
    return adjusted
}
function ___cxa_begin_catch(ptr) {
    var info = ___exception_infos[ptr];
    if (info && !info.caught) {
        info.caught = true;
        __ZSt18uncaught_exceptionv.uncaught_exception--
    }
    if (info)
        info.rethrown = false;
    ___exception_caught.push(ptr);
    ___exception_addRef(___exception_deAdjust(ptr));
    return ptr
}
var ___exception_last = 0;
function ___cxa_free_exception(ptr) {
    try {
        return _free(ptr)
    } catch (e) {}
}
function ___exception_decRef(ptr) {
    if (!ptr)
        return;
    var info = ___exception_infos[ptr];
    info.refcount--;
    if (info.refcount === 0 && !info.rethrown) {
        if (info.destructor) {
            Module["dynCall_ii"](info.destructor, ptr)
        }
        delete ___exception_infos[ptr];
        ___cxa_free_exception(ptr)
    }
}
function ___cxa_end_catch() {
    _setThrew(0);
    var ptr = ___exception_caught.pop();
    if (ptr) {
        ___exception_decRef(___exception_deAdjust(ptr));
        ___exception_last = 0
    }
}
function ___resumeException(ptr) {
    if (!___exception_last) {
        ___exception_last = ptr
    }
    throw ptr
}
function ___cxa_find_matching_catch() {
    var thrown = ___exception_last;
    if (!thrown) {
        return (setTempRet0(0),
        0) | 0
    }
    var info = ___exception_infos[thrown];
    var throwntype = info.type;
    if (!throwntype) {
        return (setTempRet0(0),
        thrown) | 0
    }
    var typeArray = Array.prototype.slice.call(arguments);
    var pointer = ___cxa_is_pointer_type(throwntype);
    if (!___cxa_find_matching_catch.buffer)
        ___cxa_find_matching_catch.buffer = _malloc(4);
    HEAP32[___cxa_find_matching_catch.buffer >> 2] = thrown;
    thrown = ___cxa_find_matching_catch.buffer;
    for (var i = 0; i < typeArray.length; i++) {
        if (typeArray[i] && ___cxa_can_catch(typeArray[i], throwntype, thrown)) {
            thrown = HEAP32[thrown >> 2];
            info.adjusted.push(thrown);
            return (setTempRet0(typeArray[i]),
            thrown) | 0
        }
    }
    thrown = HEAP32[thrown >> 2];
    return (setTempRet0(throwntype),
    thrown) | 0
}
function ___cxa_find_matching_catch_3(a0, a1, a2) {
    return ___cxa_find_matching_catch(a0, a1, a2)
}
function ___cxa_throw(ptr, type, destructor) {
    ___exception_infos[ptr] = {
        ptr: ptr,
        adjusted: [ptr],
        type: type,
        destructor: destructor,
        refcount: 0,
        caught: false,
        rethrown: false
    };
    ___exception_last = ptr;
    if (!("uncaught_exception"in __ZSt18uncaught_exceptionv)) {
        __ZSt18uncaught_exceptionv.uncaught_exception = 1
    } else {
        __ZSt18uncaught_exceptionv.uncaught_exception++
    }
    throw ptr
}
function ___cxa_uncaught_exception() {
    return !!__ZSt18uncaught_exceptionv.uncaught_exception
}
function ___lock() {}
var PATH = {
    splitPath: function(filename) {
        var splitPathRe = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
        return splitPathRe.exec(filename).slice(1)
    },
    normalizeArray: function(parts, allowAboveRoot) {
        var up = 0;
        for (var i = parts.length - 1; i >= 0; i--) {
            var last = parts[i];
            if (last === ".") {
                parts.splice(i, 1)
            } else if (last === "..") {
                parts.splice(i, 1);
                up++
            } else if (up) {
                parts.splice(i, 1);
                up--
            }
        }
        if (allowAboveRoot) {
            for (; up; up--) {
                parts.unshift("..")
            }
        }
        return parts
    },
    normalize: function(path) {
        var isAbsolute = path.charAt(0) === "/"
          , trailingSlash = path.substr(-1) === "/";
        path = PATH.normalizeArray(path.split("/").filter(function(p) {
            return !!p
        }), !isAbsolute).join("/");
        if (!path && !isAbsolute) {
            path = "."
        }
        if (path && trailingSlash) {
            path += "/"
        }
        return (isAbsolute ? "/" : "") + path
    },
    dirname: function(path) {
        var result = PATH.splitPath(path)
          , root = result[0]
          , dir = result[1];
        if (!root && !dir) {
            return "."
        }
        if (dir) {
            dir = dir.substr(0, dir.length - 1)
        }
        return root + dir
    },
    basename: function(path) {
        if (path === "/")
            return "/";
        var lastSlash = path.lastIndexOf("/");
        if (lastSlash === -1)
            return path;
        return path.substr(lastSlash + 1)
    },
    extname: function(path) {
        return PATH.splitPath(path)[3]
    },
    join: function() {
        var paths = Array.prototype.slice.call(arguments, 0);
        return PATH.normalize(paths.join("/"))
    },
    join2: function(l, r) {
        return PATH.normalize(l + "/" + r)
    }
};
var PATH_FS = {
    resolve: function() {
        var resolvedPath = ""
          , resolvedAbsolute = false;
        for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
            var path = i >= 0 ? arguments[i] : FS.cwd();
            if (typeof path !== "string") {
                throw new TypeError("Arguments to path.resolve must be strings")
            } else if (!path) {
                return ""
            }
            resolvedPath = path + "/" + resolvedPath;
            resolvedAbsolute = path.charAt(0) === "/"
        }
        resolvedPath = PATH.normalizeArray(resolvedPath.split("/").filter(function(p) {
            return !!p
        }), !resolvedAbsolute).join("/");
        return (resolvedAbsolute ? "/" : "") + resolvedPath || "."
    },
    relative: function(from, to) {
        from = PATH_FS.resolve(from).substr(1);
        to = PATH_FS.resolve(to).substr(1);
        function trim(arr) {
            var start = 0;
            for (; start < arr.length; start++) {
                if (arr[start] !== "")
                    break
            }
            var end = arr.length - 1;
            for (; end >= 0; end--) {
                if (arr[end] !== "")
                    break
            }
            if (start > end)
                return [];
            return arr.slice(start, end - start + 1)
        }
        var fromParts = trim(from.split("/"));
        var toParts = trim(to.split("/"));
        var length = Math.min(fromParts.length, toParts.length);
        var samePartsLength = length;
        for (var i = 0; i < length; i++) {
            if (fromParts[i] !== toParts[i]) {
                samePartsLength = i;
                break
            }
        }
        var outputParts = [];
        for (var i = samePartsLength; i < fromParts.length; i++) {
            outputParts.push("..")
        }
        outputParts = outputParts.concat(toParts.slice(samePartsLength));
        return outputParts.join("/")
    }
};
var TTY = {
    ttys: [],
    init: function() {},
    shutdown: function() {},
    register: function(dev, ops) {
        TTY.ttys[dev] = {
            input: [],
            output: [],
            ops: ops
        };
        FS.registerDevice(dev, TTY.stream_ops)
    },
    stream_ops: {
        open: function(stream) {
            var tty = TTY.ttys[stream.node.rdev];
            if (!tty) {
                throw new FS.ErrnoError(19)
            }
            stream.tty = tty;
            stream.seekable = false
        },
        close: function(stream) {
            stream.tty.ops.flush(stream.tty)
        },
        flush: function(stream) {
            stream.tty.ops.flush(stream.tty)
        },
        read: function(stream, buffer, offset, length, pos) {
            if (!stream.tty || !stream.tty.ops.get_char) {
                throw new FS.ErrnoError(6)
            }
            var bytesRead = 0;
            for (var i = 0; i < length; i++) {
                var result;
                try {
                    result = stream.tty.ops.get_char(stream.tty)
                } catch (e) {
                    throw new FS.ErrnoError(5)
                }
                if (result === undefined && bytesRead === 0) {
                    throw new FS.ErrnoError(11)
                }
                if (result === null || result === undefined)
                    break;
                bytesRead++;
                buffer[offset + i] = result
            }
            if (bytesRead) {
                stream.node.timestamp = Date.now()
            }
            return bytesRead
        },
        write: function(stream, buffer, offset, length, pos) {
            if (!stream.tty || !stream.tty.ops.put_char) {
                throw new FS.ErrnoError(6)
            }
            try {
                for (var i = 0; i < length; i++) {
                    stream.tty.ops.put_char(stream.tty, buffer[offset + i])
                }
            } catch (e) {
                throw new FS.ErrnoError(5)
            }
            if (length) {
                stream.node.timestamp = Date.now()
            }
            return i
        }
    },
    default_tty_ops: {
        get_char: function(tty) {
            if (!tty.input.length) {
                var result = null;
                if (ENVIRONMENT_IS_NODE) {
                    var BUFSIZE = 256;
                    var buf = new Buffer(BUFSIZE);
                    var bytesRead = 0;
                    var isPosixPlatform = process.platform != "win32";
                    var fd = process.stdin.fd;
                    if (isPosixPlatform) {
                        var usingDevice = false;
                        try {
                            fd = fs.openSync("/dev/stdin", "r");
                            usingDevice = true
                        } catch (e) {}
                    }
                    try {
                        bytesRead = fs.readSync(fd, buf, 0, BUFSIZE, null)
                    } catch (e) {
                        if (e.toString().indexOf("EOF") != -1)
                            bytesRead = 0;
                        else
                            throw e
                    }
                    if (usingDevice) {
                        fs.closeSync(fd)
                    }
                    if (bytesRead > 0) {
                        result = buf.slice(0, bytesRead).toString("utf-8")
                    } else {
                        result = null
                    }
                } else if (typeof window != "undefined" && typeof window.prompt == "function") {
                    result = window.prompt("Input: ");
                    if (result !== null) {
                        result += "\n"
                    }
                } else if (typeof readline == "function") {
                    result = readline();
                    if (result !== null) {
                        result += "\n"
                    }
                }
                if (!result) {
                    return null
                }
                tty.input = intArrayFromString(result, true)
            }
            return tty.input.shift()
        },
        put_char: function(tty, val) {
            if (val === null || val === 10) {
                out(UTF8ArrayToString(tty.output, 0));
                tty.output = []
            } else {
                if (val != 0)
                    tty.output.push(val)
            }
        },
        flush: function(tty) {
            if (tty.output && tty.output.length > 0) {
                out(UTF8ArrayToString(tty.output, 0));
                tty.output = []
            }
        }
    },
    default_tty1_ops: {
        put_char: function(tty, val) {
            if (val === null || val === 10) {
                err(UTF8ArrayToString(tty.output, 0));
                tty.output = []
            } else {
                if (val != 0)
                    tty.output.push(val)
            }
        },
        flush: function(tty) {
            if (tty.output && tty.output.length > 0) {
                err(UTF8ArrayToString(tty.output, 0));
                tty.output = []
            }
        }
    }
};
var MEMFS = {
    ops_table: null,
    mount: function(mount) {
        return MEMFS.createNode(null, "/", 16384 | 511, 0)
    },
    createNode: function(parent, name, mode, dev) {
        if (FS.isBlkdev(mode) || FS.isFIFO(mode)) {
            throw new FS.ErrnoError(1)
        }
        if (!MEMFS.ops_table) {
            MEMFS.ops_table = {
                dir: {
                    node: {
                        getattr: MEMFS.node_ops.getattr,
                        setattr: MEMFS.node_ops.setattr,
                        lookup: MEMFS.node_ops.lookup,
                        mknod: MEMFS.node_ops.mknod,
                        rename: MEMFS.node_ops.rename,
                        unlink: MEMFS.node_ops.unlink,
                        rmdir: MEMFS.node_ops.rmdir,
                        readdir: MEMFS.node_ops.readdir,
                        symlink: MEMFS.node_ops.symlink
                    },
                    stream: {
                        llseek: MEMFS.stream_ops.llseek
                    }
                },
                file: {
                    node: {
                        getattr: MEMFS.node_ops.getattr,
                        setattr: MEMFS.node_ops.setattr
                    },
                    stream: {
                        llseek: MEMFS.stream_ops.llseek,
                        read: MEMFS.stream_ops.read,
                        write: MEMFS.stream_ops.write,
                        allocate: MEMFS.stream_ops.allocate,
                        mmap: MEMFS.stream_ops.mmap,
                        msync: MEMFS.stream_ops.msync
                    }
                },
                link: {
                    node: {
                        getattr: MEMFS.node_ops.getattr,
                        setattr: MEMFS.node_ops.setattr,
                        readlink: MEMFS.node_ops.readlink
                    },
                    stream: {}
                },
                chrdev: {
                    node: {
                        getattr: MEMFS.node_ops.getattr,
                        setattr: MEMFS.node_ops.setattr
                    },
                    stream: FS.chrdev_stream_ops
                }
            }
        }
        var node = FS.createNode(parent, name, mode, dev);
        if (FS.isDir(node.mode)) {
            node.node_ops = MEMFS.ops_table.dir.node;
            node.stream_ops = MEMFS.ops_table.dir.stream;
            node.contents = {}
        } else if (FS.isFile(node.mode)) {
            node.node_ops = MEMFS.ops_table.file.node;
            node.stream_ops = MEMFS.ops_table.file.stream;
            node.usedBytes = 0;
            node.contents = null
        } else if (FS.isLink(node.mode)) {
            node.node_ops = MEMFS.ops_table.link.node;
            node.stream_ops = MEMFS.ops_table.link.stream
        } else if (FS.isChrdev(node.mode)) {
            node.node_ops = MEMFS.ops_table.chrdev.node;
            node.stream_ops = MEMFS.ops_table.chrdev.stream
        }
        node.timestamp = Date.now();
        if (parent) {
            parent.contents[name] = node
        }
        return node
    },
    getFileDataAsRegularArray: function(node) {
        if (node.contents && node.contents.subarray) {
            var arr = [];
            for (var i = 0; i < node.usedBytes; ++i)
                arr.push(node.contents[i]);
            return arr
        }
        return node.contents
    },
    getFileDataAsTypedArray: function(node) {
        if (!node.contents)
            return new Uint8Array;
        if (node.contents.subarray)
            return node.contents.subarray(0, node.usedBytes);
        return new Uint8Array(node.contents)
    },
    expandFileStorage: function(node, newCapacity) {
        var prevCapacity = node.contents ? node.contents.length : 0;
        if (prevCapacity >= newCapacity)
            return;
        var CAPACITY_DOUBLING_MAX = 1024 * 1024;
        newCapacity = Math.max(newCapacity, prevCapacity * (prevCapacity < CAPACITY_DOUBLING_MAX ? 2 : 1.125) | 0);
        if (prevCapacity != 0)
            newCapacity = Math.max(newCapacity, 256);
        var oldContents = node.contents;
        node.contents = new Uint8Array(newCapacity);
        if (node.usedBytes > 0)
            node.contents.set(oldContents.subarray(0, node.usedBytes), 0);
        return
    },
    resizeFileStorage: function(node, newSize) {
        if (node.usedBytes == newSize)
            return;
        if (newSize == 0) {
            node.contents = null;
            node.usedBytes = 0;
            return
        }
        if (!node.contents || node.contents.subarray) {
            var oldContents = node.contents;
            node.contents = new Uint8Array(new ArrayBuffer(newSize));
            if (oldContents) {
                node.contents.set(oldContents.subarray(0, Math.min(newSize, node.usedBytes)))
            }
            node.usedBytes = newSize;
            return
        }
        if (!node.contents)
            node.contents = [];
        if (node.contents.length > newSize)
            node.contents.length = newSize;
        else
            while (node.contents.length < newSize)
                node.contents.push(0);
        node.usedBytes = newSize
    },
    node_ops: {
        getattr: function(node) {
            var attr = {};
            attr.dev = FS.isChrdev(node.mode) ? node.id : 1;
            attr.ino = node.id;
            attr.mode = node.mode;
            attr.nlink = 1;
            attr.uid = 0;
            attr.gid = 0;
            attr.rdev = node.rdev;
            if (FS.isDir(node.mode)) {
                attr.size = 4096
            } else if (FS.isFile(node.mode)) {
                attr.size = node.usedBytes
            } else if (FS.isLink(node.mode)) {
                attr.size = node.link.length
            } else {
                attr.size = 0
            }
            attr.atime = new Date(node.timestamp);
            attr.mtime = new Date(node.timestamp);
            attr.ctime = new Date(node.timestamp);
            attr.blksize = 4096;
            attr.blocks = Math.ceil(attr.size / attr.blksize);
            return attr
        },
        setattr: function(node, attr) {
            if (attr.mode !== undefined) {
                node.mode = attr.mode
            }
            if (attr.timestamp !== undefined) {
                node.timestamp = attr.timestamp
            }
            if (attr.size !== undefined) {
                MEMFS.resizeFileStorage(node, attr.size)
            }
        },
        lookup: function(parent, name) {
            throw FS.genericErrors[2]
        },
        mknod: function(parent, name, mode, dev) {
            return MEMFS.createNode(parent, name, mode, dev)
        },
        rename: function(old_node, new_dir, new_name) {
            if (FS.isDir(old_node.mode)) {
                var new_node;
                try {
                    new_node = FS.lookupNode(new_dir, new_name)
                } catch (e) {}
                if (new_node) {
                    for (var i in new_node.contents) {
                        throw new FS.ErrnoError(39)
                    }
                }
            }
            delete old_node.parent.contents[old_node.name];
            old_node.name = new_name;
            new_dir.contents[new_name] = old_node;
            old_node.parent = new_dir
        },
        unlink: function(parent, name) {
            delete parent.contents[name]
        },
        rmdir: function(parent, name) {
            var node = FS.lookupNode(parent, name);
            for (var i in node.contents) {
                throw new FS.ErrnoError(39)
            }
            delete parent.contents[name]
        },
        readdir: function(node) {
            var entries = [".", ".."];
            for (var key in node.contents) {
                if (!node.contents.hasOwnProperty(key)) {
                    continue
                }
                entries.push(key)
            }
            return entries
        },
        symlink: function(parent, newname, oldpath) {
            var node = MEMFS.createNode(parent, newname, 511 | 40960, 0);
            node.link = oldpath;
            return node
        },
        readlink: function(node) {
            if (!FS.isLink(node.mode)) {
                throw new FS.ErrnoError(22)
            }
            return node.link
        }
    },
    stream_ops: {
        read: function(stream, buffer, offset, length, position) {
            var contents = stream.node.contents;
            if (position >= stream.node.usedBytes)
                return 0;
            var size = Math.min(stream.node.usedBytes - position, length);
            if (size > 8 && contents.subarray) {
                buffer.set(contents.subarray(position, position + size), offset)
            } else {
                for (var i = 0; i < size; i++)
                    buffer[offset + i] = contents[position + i]
            }
            return size
        },
        write: function(stream, buffer, offset, length, position, canOwn) {
            canOwn = false;
            if (!length)
                return 0;
            var node = stream.node;
            node.timestamp = Date.now();
            if (buffer.subarray && (!node.contents || node.contents.subarray)) {
                if (canOwn) {
                    node.contents = buffer.subarray(offset, offset + length);
                    node.usedBytes = length;
                    return length
                } else if (node.usedBytes === 0 && position === 0) {
                    node.contents = new Uint8Array(buffer.subarray(offset, offset + length));
                    node.usedBytes = length;
                    return length
                } else if (position + length <= node.usedBytes) {
                    node.contents.set(buffer.subarray(offset, offset + length), position);
                    return length
                }
            }
            MEMFS.expandFileStorage(node, position + length);
            if (node.contents.subarray && buffer.subarray)
                node.contents.set(buffer.subarray(offset, offset + length), position);
            else {
                for (var i = 0; i < length; i++) {
                    node.contents[position + i] = buffer[offset + i]
                }
            }
            node.usedBytes = Math.max(node.usedBytes, position + length);
            return length
        },
        llseek: function(stream, offset, whence) {
            var position = offset;
            if (whence === 1) {
                position += stream.position
            } else if (whence === 2) {
                if (FS.isFile(stream.node.mode)) {
                    position += stream.node.usedBytes
                }
            }
            if (position < 0) {
                throw new FS.ErrnoError(22)
            }
            return position
        },
        allocate: function(stream, offset, length) {
            MEMFS.expandFileStorage(stream.node, offset + length);
            stream.node.usedBytes = Math.max(stream.node.usedBytes, offset + length)
        },
        mmap: function(stream, buffer, offset, length, position, prot, flags) {
            if (!FS.isFile(stream.node.mode)) {
                throw new FS.ErrnoError(19)
            }
            var ptr;
            var allocated;
            var contents = stream.node.contents;
            if (!(flags & 2) && (contents.buffer === buffer || contents.buffer === buffer.buffer)) {
                allocated = false;
                ptr = contents.byteOffset
            } else {
                if (position > 0 || position + length < stream.node.usedBytes) {
                    if (contents.subarray) {
                        contents = contents.subarray(position, position + length)
                    } else {
                        contents = Array.prototype.slice.call(contents, position, position + length)
                    }
                }
                allocated = true;
                ptr = _malloc(length);
                if (!ptr) {
                    throw new FS.ErrnoError(12)
                }
                buffer.set(contents, ptr)
            }
            return {
                ptr: ptr,
                allocated: allocated
            }
        },
        msync: function(stream, buffer, offset, length, mmapFlags) {
            if (!FS.isFile(stream.node.mode)) {
                throw new FS.ErrnoError(19)
            }
            if (mmapFlags & 2) {
                return 0
            }
            var bytesWritten = MEMFS.stream_ops.write(stream, buffer, 0, length, offset, false);
            return 0
        }
    }
};
var IDBFS = {
    dbs: {},
    indexedDB: function() {
        if (typeof indexedDB !== "undefined")
            return indexedDB;
        var ret = null;
        if (typeof window === "object")
            ret = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
        assert(ret, "IDBFS used, but indexedDB not supported");
        return ret
    },
    DB_VERSION: 21,
    DB_STORE_NAME: "FILE_DATA",
    mount: function(mount) {
        return MEMFS.mount.apply(null, arguments)
    },
    syncfs: function(mount, populate, callback) {
        IDBFS.getLocalSet(mount, function(err, local) {
            if (err)
                return callback(err);
            IDBFS.getRemoteSet(mount, function(err, remote) {
                if (err)
                    return callback(err);
                var src = populate ? remote : local;
                var dst = populate ? local : remote;
                IDBFS.reconcile(src, dst, callback)
            })
        })
    },
    getDB: function(name, callback) {
        var db = IDBFS.dbs[name];
        if (db) {
            return callback(null, db)
        }
        var req;
        try {
            req = IDBFS.indexedDB().open(name, IDBFS.DB_VERSION)
        } catch (e) {
            return callback(e)
        }
        if (!req) {
            return callback("Unable to connect to IndexedDB")
        }
        req.onupgradeneeded = function(e) {
            var db = e.target.result;
            var transaction = e.target.transaction;
            var fileStore;
            if (db.objectStoreNames.contains(IDBFS.DB_STORE_NAME)) {
                fileStore = transaction.objectStore(IDBFS.DB_STORE_NAME)
            } else {
                fileStore = db.createObjectStore(IDBFS.DB_STORE_NAME)
            }
            if (!fileStore.indexNames.contains("timestamp")) {
                fileStore.createIndex("timestamp", "timestamp", {
                    unique: false
                })
            }
        }
        ;
        req.onsuccess = function() {
            db = req.result;
            IDBFS.dbs[name] = db;
            callback(null, db)
        }
        ;
        req.onerror = function(e) {
            callback(this.error);
            e.preventDefault()
        }
    },
    getLocalSet: function(mount, callback) {
        var entries = {};
        function isRealDir(p) {
            return p !== "." && p !== ".."
        }
        function toAbsolute(root) {
            return function(p) {
                return PATH.join2(root, p)
            }
        }
        var check = FS.readdir(mount.mountpoint).filter(isRealDir).map(toAbsolute(mount.mountpoint));
        while (check.length) {
            var path = check.pop();
            var stat;
            try {
                stat = FS.stat(path)
            } catch (e) {
                return callback(e)
            }
            if (FS.isDir(stat.mode)) {
                check.push.apply(check, FS.readdir(path).filter(isRealDir).map(toAbsolute(path)))
            }
            entries[path] = {
                timestamp: stat.mtime
            }
        }
        return callback(null, {
            type: "local",
            entries: entries
        })
    },
    getRemoteSet: function(mount, callback) {
        var entries = {};
        IDBFS.getDB(mount.mountpoint, function(err, db) {
            if (err)
                return callback(err);
            try {
                var transaction = db.transaction([IDBFS.DB_STORE_NAME], "readonly");
                transaction.onerror = function(e) {
                    callback(this.error);
                    e.preventDefault()
                }
                ;
                var store = transaction.objectStore(IDBFS.DB_STORE_NAME);
                var index = store.index("timestamp");
                index.openKeyCursor().onsuccess = function(event) {
                    var cursor = event.target.result;
                    if (!cursor) {
                        return callback(null, {
                            type: "remote",
                            db: db,
                            entries: entries
                        })
                    }
                    entries[cursor.primaryKey] = {
                        timestamp: cursor.key
                    };
                    cursor.continue()
                }
            } catch (e) {
                return callback(e)
            }
        })
    },
    loadLocalEntry: function(path, callback) {
        var stat, node;
        try {
            var lookup = FS.lookupPath(path);
            node = lookup.node;
            stat = FS.stat(path)
        } catch (e) {
            return callback(e)
        }
        if (FS.isDir(stat.mode)) {
            return callback(null, {
                timestamp: stat.mtime,
                mode: stat.mode
            })
        } else if (FS.isFile(stat.mode)) {
            node.contents = MEMFS.getFileDataAsTypedArray(node);
            return callback(null, {
                timestamp: stat.mtime,
                mode: stat.mode,
                contents: node.contents
            })
        } else {
            return callback(new Error("node type not supported"))
        }
    },
    storeLocalEntry: function(path, entry, callback) {
        try {
            if (FS.isDir(entry.mode)) {
                FS.mkdir(path, entry.mode)
            } else if (FS.isFile(entry.mode)) {
                FS.writeFile(path, entry.contents, {
                    canOwn: true
                })
            } else {
                return callback(new Error("node type not supported"))
            }
            FS.chmod(path, entry.mode);
            FS.utime(path, entry.timestamp, entry.timestamp)
        } catch (e) {
            return callback(e)
        }
        callback(null)
    },
    removeLocalEntry: function(path, callback) {
        try {
            var lookup = FS.lookupPath(path);
            var stat = FS.stat(path);
            if (FS.isDir(stat.mode)) {
                FS.rmdir(path)
            } else if (FS.isFile(stat.mode)) {
                FS.unlink(path)
            }
        } catch (e) {
            return callback(e)
        }
        callback(null)
    },
    loadRemoteEntry: function(store, path, callback) {
        var req = store.get(path);
        req.onsuccess = function(event) {
            callback(null, event.target.result)
        }
        ;
        req.onerror = function(e) {
            callback(this.error);
            e.preventDefault()
        }
    },
    storeRemoteEntry: function(store, path, entry, callback) {
        var req = store.put(entry, path);
        req.onsuccess = function() {
            callback(null)
        }
        ;
        req.onerror = function(e) {
            callback(this.error);
            e.preventDefault()
        }
    },
    removeRemoteEntry: function(store, path, callback) {
        var req = store.delete(path);
        req.onsuccess = function() {
            callback(null)
        }
        ;
        req.onerror = function(e) {
            callback(this.error);
            e.preventDefault()
        }
    },
    reconcile: function(src, dst, callback) {
        var total = 0;
        var create = [];
        Object.keys(src.entries).forEach(function(key) {
            var e = src.entries[key];
            var e2 = dst.entries[key];
            if (!e2 || e.timestamp > e2.timestamp) {
                create.push(key);
                total++
            }
        });
        var remove = [];
        Object.keys(dst.entries).forEach(function(key) {
            var e = dst.entries[key];
            var e2 = src.entries[key];
            if (!e2) {
                remove.push(key);
                total++
            }
        });
        if (!total) {
            return callback(null)
        }
        var errored = false;
        var db = src.type === "remote" ? src.db : dst.db;
        var transaction = db.transaction([IDBFS.DB_STORE_NAME], "readwrite");
        var store = transaction.objectStore(IDBFS.DB_STORE_NAME);
        function done(err) {
            if (err && !errored) {
                errored = true;
                return callback(err)
            }
        }
        transaction.onerror = function(e) {
            done(this.error);
            e.preventDefault()
        }
        ;
        transaction.oncomplete = function(e) {
            if (!errored) {
                callback(null)
            }
        }
        ;
        create.sort().forEach(function(path) {
            if (dst.type === "local") {
                IDBFS.loadRemoteEntry(store, path, function(err, entry) {
                    if (err)
                        return done(err);
                    IDBFS.storeLocalEntry(path, entry, done)
                })
            } else {
                IDBFS.loadLocalEntry(path, function(err, entry) {
                    if (err)
                        return done(err);
                    IDBFS.storeRemoteEntry(store, path, entry, done)
                })
            }
        });
        remove.sort().reverse().forEach(function(path) {
            if (dst.type === "local") {
                IDBFS.removeLocalEntry(path, done)
            } else {
                IDBFS.removeRemoteEntry(store, path, done)
            }
        })
    }
};
var NODEFS = {
    isWindows: false,
    staticInit: function() {
        NODEFS.isWindows = !!process.platform.match(/^win/);
        var flags = process["binding"]("constants");
        if (flags["fs"]) {
            flags = flags["fs"]
        }
        NODEFS.flagsForNodeMap = {
            1024: flags["O_APPEND"],
            64: flags["O_CREAT"],
            128: flags["O_EXCL"],
            0: flags["O_RDONLY"],
            2: flags["O_RDWR"],
            4096: flags["O_SYNC"],
            512: flags["O_TRUNC"],
            1: flags["O_WRONLY"]
        }
    },
    bufferFrom: function(arrayBuffer) {
        return Buffer.alloc ? Buffer.from(arrayBuffer) : new Buffer(arrayBuffer)
    },
    mount: function(mount) {
        assert(ENVIRONMENT_HAS_NODE);
        return NODEFS.createNode(null, "/", NODEFS.getMode(mount.opts.root), 0)
    },
    createNode: function(parent, name, mode, dev) {
        if (!FS.isDir(mode) && !FS.isFile(mode) && !FS.isLink(mode)) {
            throw new FS.ErrnoError(22)
        }
        var node = FS.createNode(parent, name, mode);
        node.node_ops = NODEFS.node_ops;
        node.stream_ops = NODEFS.stream_ops;
        return node
    },
    getMode: function(path) {
        var stat;
        try {
            stat = fs.lstatSync(path);
            if (NODEFS.isWindows) {
                stat.mode = stat.mode | (stat.mode & 292) >> 2
            }
        } catch (e) {
            if (!e.code)
                throw e;
            throw new FS.ErrnoError(-e.errno)
        }
        return stat.mode
    },
    realPath: function(node) {
        var parts = [];
        while (node.parent !== node) {
            parts.push(node.name);
            node = node.parent
        }
        parts.push(node.mount.opts.root);
        parts.reverse();
        return PATH.join.apply(null, parts)
    },
    flagsForNode: function(flags) {
        flags &= ~2097152;
        flags &= ~2048;
        flags &= ~32768;
        flags &= ~524288;
        var newFlags = 0;
        for (var k in NODEFS.flagsForNodeMap) {
            if (flags & k) {
                newFlags |= NODEFS.flagsForNodeMap[k];
                flags ^= k
            }
        }
        if (!flags) {
            return newFlags
        } else {
            throw new FS.ErrnoError(22)
        }
    },
    node_ops: {
        getattr: function(node) {
            var path = NODEFS.realPath(node);
            var stat;
            try {
                stat = fs.lstatSync(path)
            } catch (e) {
                if (!e.code)
                    throw e;
                throw new FS.ErrnoError(-e.errno)
            }
            if (NODEFS.isWindows && !stat.blksize) {
                stat.blksize = 4096
            }
            if (NODEFS.isWindows && !stat.blocks) {
                stat.blocks = (stat.size + stat.blksize - 1) / stat.blksize | 0
            }
            return {
                dev: stat.dev,
                ino: stat.ino,
                mode: stat.mode,
                nlink: stat.nlink,
                uid: stat.uid,
                gid: stat.gid,
                rdev: stat.rdev,
                size: stat.size,
                atime: stat.atime,
                mtime: stat.mtime,
                ctime: stat.ctime,
                blksize: stat.blksize,
                blocks: stat.blocks
            }
        },
        setattr: function(node, attr) {
            var path = NODEFS.realPath(node);
            try {
                if (attr.mode !== undefined) {
                    fs.chmodSync(path, attr.mode);
                    node.mode = attr.mode
                }
                if (attr.timestamp !== undefined) {
                    var date = new Date(attr.timestamp);
                    fs.utimesSync(path, date, date)
                }
                if (attr.size !== undefined) {
                    fs.truncateSync(path, attr.size)
                }
            } catch (e) {
                if (!e.code)
                    throw e;
                throw new FS.ErrnoError(-e.errno)
            }
        },
        lookup: function(parent, name) {
            var path = PATH.join2(NODEFS.realPath(parent), name);
            var mode = NODEFS.getMode(path);
            return NODEFS.createNode(parent, name, mode)
        },
        mknod: function(parent, name, mode, dev) {
            var node = NODEFS.createNode(parent, name, mode, dev);
            var path = NODEFS.realPath(node);
            try {
                if (FS.isDir(node.mode)) {
                    fs.mkdirSync(path, node.mode)
                } else {
                    fs.writeFileSync(path, "", {
                        mode: node.mode
                    })
                }
            } catch (e) {
                if (!e.code)
                    throw e;
                throw new FS.ErrnoError(-e.errno)
            }
            return node
        },
        rename: function(oldNode, newDir, newName) {
            var oldPath = NODEFS.realPath(oldNode);
            var newPath = PATH.join2(NODEFS.realPath(newDir), newName);
            try {
                fs.renameSync(oldPath, newPath)
            } catch (e) {
                if (!e.code)
                    throw e;
                throw new FS.ErrnoError(-e.errno)
            }
        },
        unlink: function(parent, name) {
            var path = PATH.join2(NODEFS.realPath(parent), name);
            try {
                fs.unlinkSync(path)
            } catch (e) {
                if (!e.code)
                    throw e;
                throw new FS.ErrnoError(-e.errno)
            }
        },
        rmdir: function(parent, name) {
            var path = PATH.join2(NODEFS.realPath(parent), name);
            try {
                fs.rmdirSync(path)
            } catch (e) {
                if (!e.code)
                    throw e;
                throw new FS.ErrnoError(-e.errno)
            }
        },
        readdir: function(node) {
            var path = NODEFS.realPath(node);
            try {
                return fs.readdirSync(path)
            } catch (e) {
                if (!e.code)
                    throw e;
                throw new FS.ErrnoError(-e.errno)
            }
        },
        symlink: function(parent, newName, oldPath) {
            var newPath = PATH.join2(NODEFS.realPath(parent), newName);
            try {
                fs.symlinkSync(oldPath, newPath)
            } catch (e) {
                if (!e.code)
                    throw e;
                throw new FS.ErrnoError(-e.errno)
            }
        },
        readlink: function(node) {
            var path = NODEFS.realPath(node);
            try {
                path = fs.readlinkSync(path);
                path = NODEJS_PATH.relative(NODEJS_PATH.resolve(node.mount.opts.root), path);
                return path
            } catch (e) {
                if (!e.code)
                    throw e;
                throw new FS.ErrnoError(-e.errno)
            }
        }
    },
    stream_ops: {
        open: function(stream) {
            var path = NODEFS.realPath(stream.node);
            try {
                if (FS.isFile(stream.node.mode)) {
                    stream.nfd = fs.openSync(path, NODEFS.flagsForNode(stream.flags))
                }
            } catch (e) {
                if (!e.code)
                    throw e;
                throw new FS.ErrnoError(-e.errno)
            }
        },
        close: function(stream) {
            try {
                if (FS.isFile(stream.node.mode) && stream.nfd) {
                    fs.closeSync(stream.nfd)
                }
            } catch (e) {
                if (!e.code)
                    throw e;
                throw new FS.ErrnoError(-e.errno)
            }
        },
        read: function(stream, buffer, offset, length, position) {
            if (length === 0)
                return 0;
            try {
                return fs.readSync(stream.nfd, NODEFS.bufferFrom(buffer.buffer), offset, length, position)
            } catch (e) {
                throw new FS.ErrnoError(-e.errno)
            }
        },
        write: function(stream, buffer, offset, length, position) {
            try {
                return fs.writeSync(stream.nfd, NODEFS.bufferFrom(buffer.buffer), offset, length, position)
            } catch (e) {
                throw new FS.ErrnoError(-e.errno)
            }
        },
        llseek: function(stream, offset, whence) {
            var position = offset;
            if (whence === 1) {
                position += stream.position
            } else if (whence === 2) {
                if (FS.isFile(stream.node.mode)) {
                    try {
                        var stat = fs.fstatSync(stream.nfd);
                        position += stat.size
                    } catch (e) {
                        throw new FS.ErrnoError(-e.errno)
                    }
                }
            }
            if (position < 0) {
                throw new FS.ErrnoError(22)
            }
            return position
        }
    }
};
var WORKERFS = {
    DIR_MODE: 16895,
    FILE_MODE: 33279,
    reader: null,
    mount: function(mount) {
        assert(ENVIRONMENT_IS_WORKER);
        if (!WORKERFS.reader)
            WORKERFS.reader = new FileReaderSync;
        var root = WORKERFS.createNode(null, "/", WORKERFS.DIR_MODE, 0);
        var createdParents = {};
        function ensureParent(path) {
            var parts = path.split("/");
            var parent = root;
            for (var i = 0; i < parts.length - 1; i++) {
                var curr = parts.slice(0, i + 1).join("/");
                if (!createdParents[curr]) {
                    createdParents[curr] = WORKERFS.createNode(parent, parts[i], WORKERFS.DIR_MODE, 0)
                }
                parent = createdParents[curr]
            }
            return parent
        }
        function base(path) {
            var parts = path.split("/");
            return parts[parts.length - 1]
        }
        Array.prototype.forEach.call(mount.opts["files"] || [], function(file) {
            WORKERFS.createNode(ensureParent(file.name), base(file.name), WORKERFS.FILE_MODE, 0, file, file.lastModifiedDate)
        });
        (mount.opts["blobs"] || []).forEach(function(obj) {
            WORKERFS.createNode(ensureParent(obj["name"]), base(obj["name"]), WORKERFS.FILE_MODE, 0, obj["data"])
        });
        (mount.opts["packages"] || []).forEach(function(pack) {
            pack["metadata"].files.forEach(function(file) {
                var name = file.filename.substr(1);
                WORKERFS.createNode(ensureParent(name), base(name), WORKERFS.FILE_MODE, 0, pack["blob"].slice(file.start, file.end))
            })
        });
        return root
    },
    createNode: function(parent, name, mode, dev, contents, mtime) {
        var node = FS.createNode(parent, name, mode);
        node.mode = mode;
        node.node_ops = WORKERFS.node_ops;
        node.stream_ops = WORKERFS.stream_ops;
        node.timestamp = (mtime || new Date).getTime();
        assert(WORKERFS.FILE_MODE !== WORKERFS.DIR_MODE);
        if (mode === WORKERFS.FILE_MODE) {
            node.size = contents.size;
            node.contents = contents
        } else {
            node.size = 4096;
            node.contents = {}
        }
        if (parent) {
            parent.contents[name] = node
        }
        return node
    },
    node_ops: {
        getattr: function(node) {
            return {
                dev: 1,
                ino: undefined,
                mode: node.mode,
                nlink: 1,
                uid: 0,
                gid: 0,
                rdev: undefined,
                size: node.size,
                atime: new Date(node.timestamp),
                mtime: new Date(node.timestamp),
                ctime: new Date(node.timestamp),
                blksize: 4096,
                blocks: Math.ceil(node.size / 4096)
            }
        },
        setattr: function(node, attr) {
            if (attr.mode !== undefined) {
                node.mode = attr.mode
            }
            if (attr.timestamp !== undefined) {
                node.timestamp = attr.timestamp
            }
        },
        lookup: function(parent, name) {
            throw new FS.ErrnoError(2)
        },
        mknod: function(parent, name, mode, dev) {
            throw new FS.ErrnoError(1)
        },
        rename: function(oldNode, newDir, newName) {
            throw new FS.ErrnoError(1)
        },
        unlink: function(parent, name) {
            throw new FS.ErrnoError(1)
        },
        rmdir: function(parent, name) {
            throw new FS.ErrnoError(1)
        },
        readdir: function(node) {
            var entries = [".", ".."];
            for (var key in node.contents) {
                if (!node.contents.hasOwnProperty(key)) {
                    continue
                }
                entries.push(key)
            }
            return entries
        },
        symlink: function(parent, newName, oldPath) {
            throw new FS.ErrnoError(1)
        },
        readlink: function(node) {
            throw new FS.ErrnoError(1)
        }
    },
    stream_ops: {
        read: function(stream, buffer, offset, length, position) {
            if (position >= stream.node.size)
                return 0;
            var chunk = stream.node.contents.slice(position, position + length);
            var ab = WORKERFS.reader.readAsArrayBuffer(chunk);
            buffer.set(new Uint8Array(ab), offset);
            return chunk.size
        },
        write: function(stream, buffer, offset, length, position) {
            throw new FS.ErrnoError(5)
        },
        llseek: function(stream, offset, whence) {
            var position = offset;
            if (whence === 1) {
                position += stream.position
            } else if (whence === 2) {
                if (FS.isFile(stream.node.mode)) {
                    position += stream.node.size
                }
            }
            if (position < 0) {
                throw new FS.ErrnoError(22)
            }
            return position
        }
    }
};
var FS = {
    root: null,
    mounts: [],
    devices: {},
    streams: [],
    nextInode: 1,
    nameTable: null,
    currentPath: "/",
    initialized: false,
    ignorePermissions: true,
    trackingDelegate: {},
    tracking: {
        openFlags: {
            READ: 1,
            WRITE: 2
        }
    },
    ErrnoError: null,
    genericErrors: {},
    filesystems: null,
    syncFSRequests: 0,
    handleFSError: function(e) {
        if (!(e instanceof FS.ErrnoError))
            throw e + " : " + stackTrace();
        return ___setErrNo(e.errno)
    },
    lookupPath: function(path, opts) {
        path = PATH_FS.resolve(FS.cwd(), path);
        opts = opts || {};
        if (!path)
            return {
                path: "",
                node: null
            };
        var defaults = {
            follow_mount: true,
            recurse_count: 0
        };
        for (var key in defaults) {
            if (opts[key] === undefined) {
                opts[key] = defaults[key]
            }
        }
        if (opts.recurse_count > 8) {
            throw new FS.ErrnoError(40)
        }
        var parts = PATH.normalizeArray(path.split("/").filter(function(p) {
            return !!p
        }), false);
        var current = FS.root;
        var current_path = "/";
        for (var i = 0; i < parts.length; i++) {
            var islast = i === parts.length - 1;
            if (islast && opts.parent) {
                break
            }
            current = FS.lookupNode(current, parts[i]);
            current_path = PATH.join2(current_path, parts[i]);
            if (FS.isMountpoint(current)) {
                if (!islast || islast && opts.follow_mount) {
                    current = current.mounted.root
                }
            }
            if (!islast || opts.follow) {
                var count = 0;
                while (FS.isLink(current.mode)) {
                    var link = FS.readlink(current_path);
                    current_path = PATH_FS.resolve(PATH.dirname(current_path), link);
                    var lookup = FS.lookupPath(current_path, {
                        recurse_count: opts.recurse_count
                    });
                    current = lookup.node;
                    if (count++ > 40) {
                        throw new FS.ErrnoError(40)
                    }
                }
            }
        }
        return {
            path: current_path,
            node: current
        }
    },
    getPath: function(node) {
        var path;
        while (true) {
            if (FS.isRoot(node)) {
                var mount = node.mount.mountpoint;
                if (!path)
                    return mount;
                return mount[mount.length - 1] !== "/" ? mount + "/" + path : mount + path
            }
            path = path ? node.name + "/" + path : node.name;
            node = node.parent
        }
    },
    hashName: function(parentid, name) {
        var hash = 0;
        for (var i = 0; i < name.length; i++) {
            hash = (hash << 5) - hash + name.charCodeAt(i) | 0
        }
        return (parentid + hash >>> 0) % FS.nameTable.length
    },
    hashAddNode: function(node) {
        var hash = FS.hashName(node.parent.id, node.name);
        node.name_next = FS.nameTable[hash];
        FS.nameTable[hash] = node
    },
    hashRemoveNode: function(node) {
        var hash = FS.hashName(node.parent.id, node.name);
        if (FS.nameTable[hash] === node) {
            FS.nameTable[hash] = node.name_next
        } else {
            var current = FS.nameTable[hash];
            while (current) {
                if (current.name_next === node) {
                    current.name_next = node.name_next;
                    break
                }
                current = current.name_next
            }
        }
    },
    lookupNode: function(parent, name) {
        var err = FS.mayLookup(parent);
        if (err) {
            throw new FS.ErrnoError(err,parent)
        }
        var hash = FS.hashName(parent.id, name);
        for (var node = FS.nameTable[hash]; node; node = node.name_next) {
            var nodeName = node.name;
            if (node.parent.id === parent.id && nodeName === name) {
                return node
            }
        }
        return FS.lookup(parent, name)
    },
    createNode: function(parent, name, mode, rdev) {
        if (!FS.FSNode) {
            FS.FSNode = function(parent, name, mode, rdev) {
                if (!parent) {
                    parent = this
                }
                this.parent = parent;
                this.mount = parent.mount;
                this.mounted = null;
                this.id = FS.nextInode++;
                this.name = name;
                this.mode = mode;
                this.node_ops = {};
                this.stream_ops = {};
                this.rdev = rdev
            }
            ;
            FS.FSNode.prototype = {};
            var readMode = 292 | 73;
            var writeMode = 146;
            Object.defineProperties(FS.FSNode.prototype, {
                read: {
                    get: function() {
                        return (this.mode & readMode) === readMode
                    },
                    set: function(val) {
                        val ? this.mode |= readMode : this.mode &= ~readMode
                    }
                },
                write: {
                    get: function() {
                        return (this.mode & writeMode) === writeMode
                    },
                    set: function(val) {
                        val ? this.mode |= writeMode : this.mode &= ~writeMode
                    }
                },
                isFolder: {
                    get: function() {
                        return FS.isDir(this.mode)
                    }
                },
                isDevice: {
                    get: function() {
                        return FS.isChrdev(this.mode)
                    }
                }
            })
        }
        var node = new FS.FSNode(parent,name,mode,rdev);
        FS.hashAddNode(node);
        return node
    },
    destroyNode: function(node) {
        FS.hashRemoveNode(node)
    },
    isRoot: function(node) {
        return node === node.parent
    },
    isMountpoint: function(node) {
        return !!node.mounted
    },
    isFile: function(mode) {
        return (mode & 61440) === 32768
    },
    isDir: function(mode) {
        return (mode & 61440) === 16384
    },
    isLink: function(mode) {
        return (mode & 61440) === 40960
    },
    isChrdev: function(mode) {
        return (mode & 61440) === 8192
    },
    isBlkdev: function(mode) {
        return (mode & 61440) === 24576
    },
    isFIFO: function(mode) {
        return (mode & 61440) === 4096
    },
    isSocket: function(mode) {
        return (mode & 49152) === 49152
    },
    flagModes: {
        "r": 0,
        "rs": 1052672,
        "r+": 2,
        "w": 577,
        "wx": 705,
        "xw": 705,
        "w+": 578,
        "wx+": 706,
        "xw+": 706,
        "a": 1089,
        "ax": 1217,
        "xa": 1217,
        "a+": 1090,
        "ax+": 1218,
        "xa+": 1218
    },
    modeStringToFlags: function(str) {
        var flags = FS.flagModes[str];
        if (typeof flags === "undefined") {
            throw new Error("Unknown file open mode: " + str)
        }
        return flags
    },
    flagsToPermissionString: function(flag) {
        var perms = ["r", "w", "rw"][flag & 3];
        if (flag & 512) {
            perms += "w"
        }
        return perms
    },
    nodePermissions: function(node, perms) {
        if (FS.ignorePermissions) {
            return 0
        }
        if (perms.indexOf("r") !== -1 && !(node.mode & 292)) {
            return 13
        } else if (perms.indexOf("w") !== -1 && !(node.mode & 146)) {
            return 13
        } else if (perms.indexOf("x") !== -1 && !(node.mode & 73)) {
            return 13
        }
        return 0
    },
    mayLookup: function(dir) {
        var err = FS.nodePermissions(dir, "x");
        if (err)
            return err;
        if (!dir.node_ops.lookup)
            return 13;
        return 0
    },
    mayCreate: function(dir, name) {
        try {
            var node = FS.lookupNode(dir, name);
            return 17
        } catch (e) {}
        return FS.nodePermissions(dir, "wx")
    },
    mayDelete: function(dir, name, isdir) {
        var node;
        try {
            node = FS.lookupNode(dir, name)
        } catch (e) {
            return e.errno
        }
        var err = FS.nodePermissions(dir, "wx");
        if (err) {
            return err
        }
        if (isdir) {
            if (!FS.isDir(node.mode)) {
                return 20
            }
            if (FS.isRoot(node) || FS.getPath(node) === FS.cwd()) {
                return 16
            }
        } else {
            if (FS.isDir(node.mode)) {
                return 21
            }
        }
        return 0
    },
    mayOpen: function(node, flags) {
        if (!node) {
            return 2
        }
        if (FS.isLink(node.mode)) {
            return 40
        } else if (FS.isDir(node.mode)) {
            if (FS.flagsToPermissionString(flags) !== "r" || flags & 512) {
                return 21
            }
        }
        return FS.nodePermissions(node, FS.flagsToPermissionString(flags))
    },
    MAX_OPEN_FDS: 4096,
    nextfd: function(fd_start, fd_end) {
        fd_start = fd_start || 0;
        fd_end = fd_end || FS.MAX_OPEN_FDS;
        for (var fd = fd_start; fd <= fd_end; fd++) {
            if (!FS.streams[fd]) {
                return fd
            }
        }
        throw new FS.ErrnoError(24)
    },
    getStream: function(fd) {
        return FS.streams[fd]
    },
    createStream: function(stream, fd_start, fd_end) {
        if (!FS.FSStream) {
            FS.FSStream = function() {}
            ;
            FS.FSStream.prototype = {};
            Object.defineProperties(FS.FSStream.prototype, {
                object: {
                    get: function() {
                        return this.node
                    },
                    set: function(val) {
                        this.node = val
                    }
                },
                isRead: {
                    get: function() {
                        return (this.flags & 2097155) !== 1
                    }
                },
                isWrite: {
                    get: function() {
                        return (this.flags & 2097155) !== 0
                    }
                },
                isAppend: {
                    get: function() {
                        return this.flags & 1024
                    }
                }
            })
        }
        var newStream = new FS.FSStream;
        for (var p in stream) {
            newStream[p] = stream[p]
        }
        stream = newStream;
        var fd = FS.nextfd(fd_start, fd_end);
        stream.fd = fd;
        FS.streams[fd] = stream;
        return stream
    },
    closeStream: function(fd) {
        FS.streams[fd] = null
    },
    chrdev_stream_ops: {
        open: function(stream) {
            var device = FS.getDevice(stream.node.rdev);
            stream.stream_ops = device.stream_ops;
            if (stream.stream_ops.open) {
                stream.stream_ops.open(stream)
            }
        },
        llseek: function() {
            throw new FS.ErrnoError(29)
        }
    },
    major: function(dev) {
        return dev >> 8
    },
    minor: function(dev) {
        return dev & 255
    },
    makedev: function(ma, mi) {
        return ma << 8 | mi
    },
    registerDevice: function(dev, ops) {
        FS.devices[dev] = {
            stream_ops: ops
        }
    },
    getDevice: function(dev) {
        return FS.devices[dev]
    },
    getMounts: function(mount) {
        var mounts = [];
        var check = [mount];
        while (check.length) {
            var m = check.pop();
            mounts.push(m);
            check.push.apply(check, m.mounts)
        }
        return mounts
    },
    syncfs: function(populate, callback) {
        if (typeof populate === "function") {
            callback = populate;
            populate = false
        }
        FS.syncFSRequests++;
        if (FS.syncFSRequests > 1) {
            console.log("warning: " + FS.syncFSRequests + " FS.syncfs operations in flight at once, probably just doing extra work")
        }
        var mounts = FS.getMounts(FS.root.mount);
        var completed = 0;
        function doCallback(err) {
            FS.syncFSRequests--;
            return callback(err)
        }
        function done(err) {
            if (err) {
                if (!done.errored) {
                    done.errored = true;
                    return doCallback(err)
                }
                return
            }
            if (++completed >= mounts.length) {
                doCallback(null)
            }
        }
        mounts.forEach(function(mount) {
            if (!mount.type.syncfs) {
                return done(null)
            }
            mount.type.syncfs(mount, populate, done)
        })
    },
    mount: function(type, opts, mountpoint) {
        var root = mountpoint === "/";
        var pseudo = !mountpoint;
        var node;
        if (root && FS.root) {
            throw new FS.ErrnoError(16)
        } else if (!root && !pseudo) {
            var lookup = FS.lookupPath(mountpoint, {
                follow_mount: false
            });
            mountpoint = lookup.path;
            node = lookup.node;
            if (FS.isMountpoint(node)) {
                throw new FS.ErrnoError(16)
            }
            if (!FS.isDir(node.mode)) {
                throw new FS.ErrnoError(20)
            }
        }
        var mount = {
            type: type,
            opts: opts,
            mountpoint: mountpoint,
            mounts: []
        };
        var mountRoot = type.mount(mount);
        mountRoot.mount = mount;
        mount.root = mountRoot;
        if (root) {
            FS.root = mountRoot
        } else if (node) {
            node.mounted = mount;
            if (node.mount) {
                node.mount.mounts.push(mount)
            }
        }
        return mountRoot
    },
    unmount: function(mountpoint) {
        var lookup = FS.lookupPath(mountpoint, {
            follow_mount: false
        });
        if (!FS.isMountpoint(lookup.node)) {
            throw new FS.ErrnoError(22)
        }
        var node = lookup.node;
        var mount = node.mounted;
        var mounts = FS.getMounts(mount);
        Object.keys(FS.nameTable).forEach(function(hash) {
            var current = FS.nameTable[hash];
            while (current) {
                var next = current.name_next;
                if (mounts.indexOf(current.mount) !== -1) {
                    FS.destroyNode(current)
                }
                current = next
            }
        });
        node.mounted = null;
        var idx = node.mount.mounts.indexOf(mount);
        node.mount.mounts.splice(idx, 1)
    },
    lookup: function(parent, name) {
        return parent.node_ops.lookup(parent, name)
    },
    mknod: function(path, mode, dev) {
        var lookup = FS.lookupPath(path, {
            parent: true
        });
        var parent = lookup.node;
        var name = PATH.basename(path);
        if (!name || name === "." || name === "..") {
            throw new FS.ErrnoError(22)
        }
        var err = FS.mayCreate(parent, name);
        if (err) {
            throw new FS.ErrnoError(err)
        }
        if (!parent.node_ops.mknod) {
            throw new FS.ErrnoError(1)
        }
        return parent.node_ops.mknod(parent, name, mode, dev)
    },
    create: function(path, mode) {
        mode = mode !== undefined ? mode : 438;
        mode &= 4095;
        mode |= 32768;
        return FS.mknod(path, mode, 0)
    },
    mkdir: function(path, mode) {
        mode = mode !== undefined ? mode : 511;
        mode &= 511 | 512;
        mode |= 16384;
        return FS.mknod(path, mode, 0)
    },
    mkdirTree: function(path, mode) {
        var dirs = path.split("/");
        var d = "";
        for (var i = 0; i < dirs.length; ++i) {
            if (!dirs[i])
                continue;
            d += "/" + dirs[i];
            try {
                FS.mkdir(d, mode)
            } catch (e) {
                if (e.errno != 17)
                    throw e
            }
        }
    },
    mkdev: function(path, mode, dev) {
        if (typeof dev === "undefined") {
            dev = mode;
            mode = 438
        }
        mode |= 8192;
        return FS.mknod(path, mode, dev)
    },
    symlink: function(oldpath, newpath) {
        if (!PATH_FS.resolve(oldpath)) {
            throw new FS.ErrnoError(2)
        }
        var lookup = FS.lookupPath(newpath, {
            parent: true
        });
        var parent = lookup.node;
        if (!parent) {
            throw new FS.ErrnoError(2)
        }
        var newname = PATH.basename(newpath);
        var err = FS.mayCreate(parent, newname);
        if (err) {
            throw new FS.ErrnoError(err)
        }
        if (!parent.node_ops.symlink) {
            throw new FS.ErrnoError(1)
        }
        return parent.node_ops.symlink(parent, newname, oldpath)
    },
    rename: function(old_path, new_path) {
        var old_dirname = PATH.dirname(old_path);
        var new_dirname = PATH.dirname(new_path);
        var old_name = PATH.basename(old_path);
        var new_name = PATH.basename(new_path);
        var lookup, old_dir, new_dir;
        try {
            lookup = FS.lookupPath(old_path, {
                parent: true
            });
            old_dir = lookup.node;
            lookup = FS.lookupPath(new_path, {
                parent: true
            });
            new_dir = lookup.node
        } catch (e) {
            throw new FS.ErrnoError(16)
        }
        if (!old_dir || !new_dir)
            throw new FS.ErrnoError(2);
        if (old_dir.mount !== new_dir.mount) {
            throw new FS.ErrnoError(18)
        }
        var old_node = FS.lookupNode(old_dir, old_name);
        var relative = PATH_FS.relative(old_path, new_dirname);
        if (relative.charAt(0) !== ".") {
            throw new FS.ErrnoError(22)
        }
        relative = PATH_FS.relative(new_path, old_dirname);
        if (relative.charAt(0) !== ".") {
            throw new FS.ErrnoError(39)
        }
        var new_node;
        try {
            new_node = FS.lookupNode(new_dir, new_name)
        } catch (e) {}
        if (old_node === new_node) {
            return
        }
        var isdir = FS.isDir(old_node.mode);
        var err = FS.mayDelete(old_dir, old_name, isdir);
        if (err) {
            throw new FS.ErrnoError(err)
        }
        err = new_node ? FS.mayDelete(new_dir, new_name, isdir) : FS.mayCreate(new_dir, new_name);
        if (err) {
            throw new FS.ErrnoError(err)
        }
        if (!old_dir.node_ops.rename) {
            throw new FS.ErrnoError(1)
        }
        if (FS.isMountpoint(old_node) || new_node && FS.isMountpoint(new_node)) {
            throw new FS.ErrnoError(16)
        }
        if (new_dir !== old_dir) {
            err = FS.nodePermissions(old_dir, "w");
            if (err) {
                throw new FS.ErrnoError(err)
            }
        }
        try {
            if (FS.trackingDelegate["willMovePath"]) {
                FS.trackingDelegate["willMovePath"](old_path, new_path)
            }
        } catch (e) {
            console.log("FS.trackingDelegate['willMovePath']('" + old_path + "', '" + new_path + "') threw an exception: " + e.message)
        }
        FS.hashRemoveNode(old_node);
        try {
            old_dir.node_ops.rename(old_node, new_dir, new_name)
        } catch (e) {
            throw e
        } finally {
            FS.hashAddNode(old_node)
        }
        try {
            if (FS.trackingDelegate["onMovePath"])
                FS.trackingDelegate["onMovePath"](old_path, new_path)
        } catch (e) {
            console.log("FS.trackingDelegate['onMovePath']('" + old_path + "', '" + new_path + "') threw an exception: " + e.message)
        }
    },
    rmdir: function(path) {
        var lookup = FS.lookupPath(path, {
            parent: true
        });
        var parent = lookup.node;
        var name = PATH.basename(path);
        var node = FS.lookupNode(parent, name);
        var err = FS.mayDelete(parent, name, true);
        if (err) {
            throw new FS.ErrnoError(err)
        }
        if (!parent.node_ops.rmdir) {
            throw new FS.ErrnoError(1)
        }
        if (FS.isMountpoint(node)) {
            throw new FS.ErrnoError(16)
        }
        try {
            if (FS.trackingDelegate["willDeletePath"]) {
                FS.trackingDelegate["willDeletePath"](path)
            }
        } catch (e) {
            console.log("FS.trackingDelegate['willDeletePath']('" + path + "') threw an exception: " + e.message)
        }
        parent.node_ops.rmdir(parent, name);
        FS.destroyNode(node);
        try {
            if (FS.trackingDelegate["onDeletePath"])
                FS.trackingDelegate["onDeletePath"](path)
        } catch (e) {
            console.log("FS.trackingDelegate['onDeletePath']('" + path + "') threw an exception: " + e.message)
        }
    },
    readdir: function(path) {
        var lookup = FS.lookupPath(path, {
            follow: true
        });
        var node = lookup.node;
        if (!node.node_ops.readdir) {
            throw new FS.ErrnoError(20)
        }
        return node.node_ops.readdir(node)
    },
    unlink: function(path) {
        var lookup = FS.lookupPath(path, {
            parent: true
        });
        var parent = lookup.node;
        var name = PATH.basename(path);
        var node = FS.lookupNode(parent, name);
        var err = FS.mayDelete(parent, name, false);
        if (err) {
            throw new FS.ErrnoError(err)
        }
        if (!parent.node_ops.unlink) {
            throw new FS.ErrnoError(1)
        }
        if (FS.isMountpoint(node)) {
            throw new FS.ErrnoError(16)
        }
        try {
            if (FS.trackingDelegate["willDeletePath"]) {
                FS.trackingDelegate["willDeletePath"](path)
            }
        } catch (e) {
            console.log("FS.trackingDelegate['willDeletePath']('" + path + "') threw an exception: " + e.message)
        }
        parent.node_ops.unlink(parent, name);
        FS.destroyNode(node);
        try {
            if (FS.trackingDelegate["onDeletePath"])
                FS.trackingDelegate["onDeletePath"](path)
        } catch (e) {
            console.log("FS.trackingDelegate['onDeletePath']('" + path + "') threw an exception: " + e.message)
        }
    },
    readlink: function(path) {
        var lookup = FS.lookupPath(path);
        var link = lookup.node;
        if (!link) {
            throw new FS.ErrnoError(2)
        }
        if (!link.node_ops.readlink) {
            throw new FS.ErrnoError(22)
        }
        return PATH_FS.resolve(FS.getPath(link.parent), link.node_ops.readlink(link))
    },
    stat: function(path, dontFollow) {
        var lookup = FS.lookupPath(path, {
            follow: !dontFollow
        });
        var node = lookup.node;
        if (!node) {
            throw new FS.ErrnoError(2)
        }
        if (!node.node_ops.getattr) {
            throw new FS.ErrnoError(1)
        }
        return node.node_ops.getattr(node)
    },
    lstat: function(path) {
        return FS.stat(path, true)
    },
    chmod: function(path, mode, dontFollow) {
        var node;
        if (typeof path === "string") {
            var lookup = FS.lookupPath(path, {
                follow: !dontFollow
            });
            node = lookup.node
        } else {
            node = path
        }
        if (!node.node_ops.setattr) {
            throw new FS.ErrnoError(1)
        }
        node.node_ops.setattr(node, {
            mode: mode & 4095 | node.mode & ~4095,
            timestamp: Date.now()
        })
    },
    lchmod: function(path, mode) {
        FS.chmod(path, mode, true)
    },
    fchmod: function(fd, mode) {
        var stream = FS.getStream(fd);
        if (!stream) {
            throw new FS.ErrnoError(9)
        }
        FS.chmod(stream.node, mode)
    },
    chown: function(path, uid, gid, dontFollow) {
        var node;
        if (typeof path === "string") {
            var lookup = FS.lookupPath(path, {
                follow: !dontFollow
            });
            node = lookup.node
        } else {
            node = path
        }
        if (!node.node_ops.setattr) {
            throw new FS.ErrnoError(1)
        }
        node.node_ops.setattr(node, {
            timestamp: Date.now()
        })
    },
    lchown: function(path, uid, gid) {
        FS.chown(path, uid, gid, true)
    },
    fchown: function(fd, uid, gid) {
        var stream = FS.getStream(fd);
        if (!stream) {
            throw new FS.ErrnoError(9)
        }
        FS.chown(stream.node, uid, gid)
    },
    truncate: function(path, len) {
        if (len < 0) {
            throw new FS.ErrnoError(22)
        }
        var node;
        if (typeof path === "string") {
            var lookup = FS.lookupPath(path, {
                follow: true
            });
            node = lookup.node
        } else {
            node = path
        }
        if (!node.node_ops.setattr) {
            throw new FS.ErrnoError(1)
        }
        if (FS.isDir(node.mode)) {
            throw new FS.ErrnoError(21)
        }
        if (!FS.isFile(node.mode)) {
            throw new FS.ErrnoError(22)
        }
        var err = FS.nodePermissions(node, "w");
        if (err) {
            throw new FS.ErrnoError(err)
        }
        node.node_ops.setattr(node, {
            size: len,
            timestamp: Date.now()
        })
    },
    ftruncate: function(fd, len) {
        var stream = FS.getStream(fd);
        if (!stream) {
            throw new FS.ErrnoError(9)
        }
        if ((stream.flags & 2097155) === 0) {
            throw new FS.ErrnoError(22)
        }
        FS.truncate(stream.node, len)
    },
    utime: function(path, atime, mtime) {
        var lookup = FS.lookupPath(path, {
            follow: true
        });
        var node = lookup.node;
        node.node_ops.setattr(node, {
            timestamp: Math.max(atime, mtime)
        })
    },
    open: function(path, flags, mode, fd_start, fd_end) {
        if (path === "") {
            throw new FS.ErrnoError(2)
        }
        flags = typeof flags === "string" ? FS.modeStringToFlags(flags) : flags;
        mode = typeof mode === "undefined" ? 438 : mode;
        if (flags & 64) {
            mode = mode & 4095 | 32768
        } else {
            mode = 0
        }
        var node;
        if (typeof path === "object") {
            node = path
        } else {
            path = PATH.normalize(path);
            try {
                var lookup = FS.lookupPath(path, {
                    follow: !(flags & 131072)
                });
                node = lookup.node
            } catch (e) {}
        }
        var created = false;
        if (flags & 64) {
            if (node) {
                if (flags & 128) {
                    throw new FS.ErrnoError(17)
                }
            } else {
                node = FS.mknod(path, mode, 0);
                created = true
            }
        }
        if (!node) {
            throw new FS.ErrnoError(2)
        }
        if (FS.isChrdev(node.mode)) {
            flags &= ~512
        }
        if (flags & 65536 && !FS.isDir(node.mode)) {
            throw new FS.ErrnoError(20)
        }
        if (!created) {
            var err = FS.mayOpen(node, flags);
            if (err) {
                throw new FS.ErrnoError(err)
            }
        }
        if (flags & 512) {
            FS.truncate(node, 0)
        }
        flags &= ~(128 | 512);
        var stream = FS.createStream({
            node: node,
            path: FS.getPath(node),
            flags: flags,
            seekable: true,
            position: 0,
            stream_ops: node.stream_ops,
            ungotten: [],
            error: false
        }, fd_start, fd_end);
        if (stream.stream_ops.open) {
            stream.stream_ops.open(stream)
        }
        if (Module["logReadFiles"] && !(flags & 1)) {
            if (!FS.readFiles)
                FS.readFiles = {};
            if (!(path in FS.readFiles)) {
                FS.readFiles[path] = 1;
                console.log("FS.trackingDelegate error on read file: " + path)
            }
        }
        try {
            if (FS.trackingDelegate["onOpenFile"]) {
                var trackingFlags = 0;
                if ((flags & 2097155) !== 1) {
                    trackingFlags |= FS.tracking.openFlags.READ
                }
                if ((flags & 2097155) !== 0) {
                    trackingFlags |= FS.tracking.openFlags.WRITE
                }
                FS.trackingDelegate["onOpenFile"](path, trackingFlags)
            }
        } catch (e) {
            console.log("FS.trackingDelegate['onOpenFile']('" + path + "', flags) threw an exception: " + e.message)
        }
        return stream
    },
    close: function(stream) {
        if (FS.isClosed(stream)) {
            throw new FS.ErrnoError(9)
        }
        if (stream.getdents)
            stream.getdents = null;
        try {
            if (stream.stream_ops.close) {
                stream.stream_ops.close(stream)
            }
        } catch (e) {
            throw e
        } finally {
            FS.closeStream(stream.fd)
        }
        stream.fd = null
    },
    isClosed: function(stream) {
        return stream.fd === null
    },
    llseek: function(stream, offset, whence) {
        if (FS.isClosed(stream)) {
            throw new FS.ErrnoError(9)
        }
        if (!stream.seekable || !stream.stream_ops.llseek) {
            throw new FS.ErrnoError(29)
        }
        if (whence != 0 && whence != 1 && whence != 2) {
            throw new FS.ErrnoError(22)
        }
        stream.position = stream.stream_ops.llseek(stream, offset, whence);
        stream.ungotten = [];
        return stream.position
    },
    read: function(stream, buffer, offset, length, position) {
        if (length < 0 || position < 0) {
            throw new FS.ErrnoError(22)
        }
        if (FS.isClosed(stream)) {
            throw new FS.ErrnoError(9)
        }
        if ((stream.flags & 2097155) === 1) {
            throw new FS.ErrnoError(9)
        }
        if (FS.isDir(stream.node.mode)) {
            throw new FS.ErrnoError(21)
        }
        if (!stream.stream_ops.read) {
            throw new FS.ErrnoError(22)
        }
        var seeking = typeof position !== "undefined";
        if (!seeking) {
            position = stream.position
        } else if (!stream.seekable) {
            throw new FS.ErrnoError(29)
        }
        var bytesRead = stream.stream_ops.read(stream, buffer, offset, length, position);
        if (!seeking)
            stream.position += bytesRead;
        return bytesRead
    },
    write: function(stream, buffer, offset, length, position, canOwn) {
        if (length < 0 || position < 0) {
            throw new FS.ErrnoError(22)
        }
        if (FS.isClosed(stream)) {
            throw new FS.ErrnoError(9)
        }
        if ((stream.flags & 2097155) === 0) {
            throw new FS.ErrnoError(9)
        }
        if (FS.isDir(stream.node.mode)) {
            throw new FS.ErrnoError(21)
        }
        if (!stream.stream_ops.write) {
            throw new FS.ErrnoError(22)
        }
        if (stream.flags & 1024) {
            FS.llseek(stream, 0, 2)
        }
        var seeking = typeof position !== "undefined";
        if (!seeking) {
            position = stream.position
        } else if (!stream.seekable) {
            throw new FS.ErrnoError(29)
        }
        var bytesWritten = stream.stream_ops.write(stream, buffer, offset, length, position, canOwn);
        if (!seeking)
            stream.position += bytesWritten;
        try {
            if (stream.path && FS.trackingDelegate["onWriteToFile"])
                FS.trackingDelegate["onWriteToFile"](stream.path)
        } catch (e) {
            console.log("FS.trackingDelegate['onWriteToFile']('" + stream.path + "') threw an exception: " + e.message)
        }
        return bytesWritten
    },
    allocate: function(stream, offset, length) {
        if (FS.isClosed(stream)) {
            throw new FS.ErrnoError(9)
        }
        if (offset < 0 || length <= 0) {
            throw new FS.ErrnoError(22)
        }
        if ((stream.flags & 2097155) === 0) {
            throw new FS.ErrnoError(9)
        }
        if (!FS.isFile(stream.node.mode) && !FS.isDir(stream.node.mode)) {
            throw new FS.ErrnoError(19)
        }
        if (!stream.stream_ops.allocate) {
            throw new FS.ErrnoError(95)
        }
        stream.stream_ops.allocate(stream, offset, length)
    },
    mmap: function(stream, buffer, offset, length, position, prot, flags) {
        if ((prot & 2) !== 0 && (flags & 2) === 0 && (stream.flags & 2097155) !== 2) {
            throw new FS.ErrnoError(13)
        }
        if ((stream.flags & 2097155) === 1) {
            throw new FS.ErrnoError(13)
        }
        if (!stream.stream_ops.mmap) {
            throw new FS.ErrnoError(19)
        }
        return stream.stream_ops.mmap(stream, buffer, offset, length, position, prot, flags)
    },
    msync: function(stream, buffer, offset, length, mmapFlags) {
        if (!stream || !stream.stream_ops.msync) {
            return 0
        }
        return stream.stream_ops.msync(stream, buffer, offset, length, mmapFlags)
    },
    munmap: function(stream) {
        return 0
    },
    ioctl: function(stream, cmd, arg) {
        if (!stream.stream_ops.ioctl) {
            throw new FS.ErrnoError(25)
        }
        return stream.stream_ops.ioctl(stream, cmd, arg)
    },
    readFile: function(path, opts) {
        opts = opts || {};
        opts.flags = opts.flags || "r";
        opts.encoding = opts.encoding || "binary";
        if (opts.encoding !== "utf8" && opts.encoding !== "binary") {
            throw new Error('Invalid encoding type "' + opts.encoding + '"')
        }
        var ret;
        var stream = FS.open(path, opts.flags);
        var stat = FS.stat(path);
        var length = stat.size;
        var buf = new Uint8Array(length);
        FS.read(stream, buf, 0, length, 0);
        if (opts.encoding === "utf8") {
            ret = UTF8ArrayToString(buf, 0)
        } else if (opts.encoding === "binary") {
            ret = buf
        }
        FS.close(stream);
        return ret
    },
    writeFile: function(path, data, opts) {
        opts = opts || {};
        opts.flags = opts.flags || "w";
        var stream = FS.open(path, opts.flags, opts.mode);
        if (typeof data === "string") {
            var buf = new Uint8Array(lengthBytesUTF8(data) + 1);
            var actualNumBytes = stringToUTF8Array(data, buf, 0, buf.length);
            FS.write(stream, buf, 0, actualNumBytes, undefined, opts.canOwn)
        } else if (ArrayBuffer.isView(data)) {
            FS.write(stream, data, 0, data.byteLength, undefined, opts.canOwn)
        } else {
            throw new Error("Unsupported data type")
        }
        FS.close(stream)
    },
    cwd: function() {
        return FS.currentPath
    },
    chdir: function(path) {
        var lookup = FS.lookupPath(path, {
            follow: true
        });
        if (lookup.node === null) {
            throw new FS.ErrnoError(2)
        }
        if (!FS.isDir(lookup.node.mode)) {
            throw new FS.ErrnoError(20)
        }
        var err = FS.nodePermissions(lookup.node, "x");
        if (err) {
            throw new FS.ErrnoError(err)
        }
        FS.currentPath = lookup.path
    },
    createDefaultDirectories: function() {
        FS.mkdir("/tmp");
        FS.mkdir("/home");
        FS.mkdir("/home/web_user")
    },
    createDefaultDevices: function() {
        FS.mkdir("/dev");
        FS.registerDevice(FS.makedev(1, 3), {
            read: function() {
                return 0
            },
            write: function(stream, buffer, offset, length, pos) {
                return length
            }
        });
        FS.mkdev("/dev/null", FS.makedev(1, 3));
        TTY.register(FS.makedev(5, 0), TTY.default_tty_ops);
        TTY.register(FS.makedev(6, 0), TTY.default_tty1_ops);
        FS.mkdev("/dev/tty", FS.makedev(5, 0));
        FS.mkdev("/dev/tty1", FS.makedev(6, 0));
        var random_device;
        if (typeof crypto === "object" && typeof crypto["getRandomValues"] === "function") {
            var randomBuffer = new Uint8Array(1);
            random_device = function() {
                crypto.getRandomValues(randomBuffer);
                return randomBuffer[0]
            }
        } else if (ENVIRONMENT_IS_NODE) {
            try {
                var crypto_module = require("crypto");
                random_device = function() {
                    return crypto_module["randomBytes"](1)[0]
                }
            } catch (e) {}
        } else {}
        if (!random_device) {
            random_device = function() {
                abort("random_device")
            }
        }
        FS.createDevice("/dev", "random", random_device);
        FS.createDevice("/dev", "urandom", random_device);
        FS.mkdir("/dev/shm");
        FS.mkdir("/dev/shm/tmp")
    },
    createSpecialDirectories: function() {
        FS.mkdir("/proc");
        FS.mkdir("/proc/self");
        FS.mkdir("/proc/self/fd");
        FS.mount({
            mount: function() {
                var node = FS.createNode("/proc/self", "fd", 16384 | 511, 73);
                node.node_ops = {
                    lookup: function(parent, name) {
                        var fd = +name;
                        var stream = FS.getStream(fd);
                        if (!stream)
                            throw new FS.ErrnoError(9);
                        var ret = {
                            parent: null,
                            mount: {
                                mountpoint: "fake"
                            },
                            node_ops: {
                                readlink: function() {
                                    return stream.path
                                }
                            }
                        };
                        ret.parent = ret;
                        return ret
                    }
                };
                return node
            }
        }, {}, "/proc/self/fd")
    },
    createStandardStreams: function() {
        if (Module["stdin"]) {
            FS.createDevice("/dev", "stdin", Module["stdin"])
        } else {
            FS.symlink("/dev/tty", "/dev/stdin")
        }
        if (Module["stdout"]) {
            FS.createDevice("/dev", "stdout", null, Module["stdout"])
        } else {
            FS.symlink("/dev/tty", "/dev/stdout")
        }
        if (Module["stderr"]) {
            FS.createDevice("/dev", "stderr", null, Module["stderr"])
        } else {
            FS.symlink("/dev/tty1", "/dev/stderr")
        }
        var stdin = FS.open("/dev/stdin", "r");
        var stdout = FS.open("/dev/stdout", "w");
        var stderr = FS.open("/dev/stderr", "w")
    },
    ensureErrnoError: function() {
        if (FS.ErrnoError)
            return;
        FS.ErrnoError = function ErrnoError(errno, node) {
            this.node = node;
            this.setErrno = function(errno) {
                this.errno = errno
            }
            ;
            this.setErrno(errno);
            this.message = "FS error";
            if (this.stack)
                Object.defineProperty(this, "stack", {
                    value: (new Error).stack,
                    writable: true
                })
        }
        ;
        FS.ErrnoError.prototype = new Error;
        FS.ErrnoError.prototype.constructor = FS.ErrnoError;
        [2].forEach(function(code) {
            FS.genericErrors[code] = new FS.ErrnoError(code);
            FS.genericErrors[code].stack = "<generic error, no stack>"
        })
    },
    staticInit: function() {
        FS.ensureErrnoError();
        FS.nameTable = new Array(4096);
        FS.mount(MEMFS, {}, "/");
        FS.createDefaultDirectories();
        FS.createDefaultDevices();
        FS.createSpecialDirectories();
        FS.filesystems = {
            "MEMFS": MEMFS,
            "IDBFS": IDBFS,
            "NODEFS": NODEFS,
            "WORKERFS": WORKERFS
        }
    },
    init: function(input, output, error) {
        FS.init.initialized = true;
        FS.ensureErrnoError();
        Module["stdin"] = input || Module["stdin"];
        Module["stdout"] = output || Module["stdout"];
        Module["stderr"] = error || Module["stderr"];
        FS.createStandardStreams()
    },
    quit: function() {
        FS.init.initialized = false;
        var fflush = Module["_fflush"];
        if (fflush)
            fflush(0);
        for (var i = 0; i < FS.streams.length; i++) {
            var stream = FS.streams[i];
            if (!stream) {
                continue
            }
            FS.close(stream)
        }
    },
    getMode: function(canRead, canWrite) {
        var mode = 0;
        if (canRead)
            mode |= 292 | 73;
        if (canWrite)
            mode |= 146;
        return mode
    },
    joinPath: function(parts, forceRelative) {
        var path = PATH.join.apply(null, parts);
        if (forceRelative && path[0] == "/")
            path = path.substr(1);
        return path
    },
    absolutePath: function(relative, base) {
        return PATH_FS.resolve(base, relative)
    },
    standardizePath: function(path) {
        return PATH.normalize(path)
    },
    findObject: function(path, dontResolveLastLink) {
        var ret = FS.analyzePath(path, dontResolveLastLink);
        if (ret.exists) {
            return ret.object
        } else {
            ___setErrNo(ret.error);
            return null
        }
    },
    analyzePath: function(path, dontResolveLastLink) {
        try {
            var lookup = FS.lookupPath(path, {
                follow: !dontResolveLastLink
            });
            path = lookup.path
        } catch (e) {}
        var ret = {
            isRoot: false,
            exists: false,
            error: 0,
            name: null,
            path: null,
            object: null,
            parentExists: false,
            parentPath: null,
            parentObject: null
        };
        try {
            var lookup = FS.lookupPath(path, {
                parent: true
            });
            ret.parentExists = true;
            ret.parentPath = lookup.path;
            ret.parentObject = lookup.node;
            ret.name = PATH.basename(path);
            lookup = FS.lookupPath(path, {
                follow: !dontResolveLastLink
            });
            ret.exists = true;
            ret.path = lookup.path;
            ret.object = lookup.node;
            ret.name = lookup.node.name;
            ret.isRoot = lookup.path === "/"
        } catch (e) {
            ret.error = e.errno
        }
        return ret
    },
    createFolder: function(parent, name, canRead, canWrite) {
        var path = PATH.join2(typeof parent === "string" ? parent : FS.getPath(parent), name);
        var mode = FS.getMode(canRead, canWrite);
        return FS.mkdir(path, mode)
    },
    createPath: function(parent, path, canRead, canWrite) {
        parent = typeof parent === "string" ? parent : FS.getPath(parent);
        var parts = path.split("/").reverse();
        while (parts.length) {
            var part = parts.pop();
            if (!part)
                continue;
            var current = PATH.join2(parent, part);
            try {
                FS.mkdir(current)
            } catch (e) {}
            parent = current
        }
        return current
    },
    createFile: function(parent, name, properties, canRead, canWrite) {
        var path = PATH.join2(typeof parent === "string" ? parent : FS.getPath(parent), name);
        var mode = FS.getMode(canRead, canWrite);
        return FS.create(path, mode)
    },
    createDataFile: function(parent, name, data, canRead, canWrite, canOwn) {
        var path = name ? PATH.join2(typeof parent === "string" ? parent : FS.getPath(parent), name) : parent;
        var mode = FS.getMode(canRead, canWrite);
        var node = FS.create(path, mode);
        if (data) {
            if (typeof data === "string") {
                var arr = new Array(data.length);
                for (var i = 0, len = data.length; i < len; ++i)
                    arr[i] = data.charCodeAt(i);
                data = arr
            }
            FS.chmod(node, mode | 146);
            var stream = FS.open(node, "w");
            FS.write(stream, data, 0, data.length, 0, canOwn);
            FS.close(stream);
            FS.chmod(node, mode)
        }
        return node
    },
    createDevice: function(parent, name, input, output) {
        var path = PATH.join2(typeof parent === "string" ? parent : FS.getPath(parent), name);
        var mode = FS.getMode(!!input, !!output);
        if (!FS.createDevice.major)
            FS.createDevice.major = 64;
        var dev = FS.makedev(FS.createDevice.major++, 0);
        FS.registerDevice(dev, {
            open: function(stream) {
                stream.seekable = false
            },
            close: function(stream) {
                if (output && output.buffer && output.buffer.length) {
                    output(10)
                }
            },
            read: function(stream, buffer, offset, length, pos) {
                var bytesRead = 0;
                for (var i = 0; i < length; i++) {
                    var result;
                    try {
                        result = input()
                    } catch (e) {
                        throw new FS.ErrnoError(5)
                    }
                    if (result === undefined && bytesRead === 0) {
                        throw new FS.ErrnoError(11)
                    }
                    if (result === null || result === undefined)
                        break;
                    bytesRead++;
                    buffer[offset + i] = result
                }
                if (bytesRead) {
                    stream.node.timestamp = Date.now()
                }
                return bytesRead
            },
            write: function(stream, buffer, offset, length, pos) {
                for (var i = 0; i < length; i++) {
                    try {
                        output(buffer[offset + i])
                    } catch (e) {
                        throw new FS.ErrnoError(5)
                    }
                }
                if (length) {
                    stream.node.timestamp = Date.now()
                }
                return i
            }
        });
        return FS.mkdev(path, mode, dev)
    },
    createLink: function(parent, name, target, canRead, canWrite) {
        var path = PATH.join2(typeof parent === "string" ? parent : FS.getPath(parent), name);
        return FS.symlink(target, path)
    },
    forceLoadFile: function(obj) {
        if (obj.isDevice || obj.isFolder || obj.link || obj.contents)
            return true;
        var success = true;
        if (typeof XMLHttpRequest !== "undefined") {
            throw new Error("Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.")
        } else if (Module["read"]) {
            try {
                obj.contents = intArrayFromString(Module["read"](obj.url), true);
                obj.usedBytes = obj.contents.length
            } catch (e) {
                success = false
            }
        } else {
            throw new Error("Cannot load without read() or XMLHttpRequest.")
        }
        if (!success)
            ___setErrNo(5);
        return success
    },
    createLazyFile: function(parent, name, url, canRead, canWrite) {
        function LazyUint8Array() {
            this.lengthKnown = false;
            this.chunks = []
        }
        LazyUint8Array.prototype.get = function LazyUint8Array_get(idx) {
            if (idx > this.length - 1 || idx < 0) {
                return undefined
            }
            var chunkOffset = idx % this.chunkSize;
            var chunkNum = idx / this.chunkSize | 0;
            return this.getter(chunkNum)[chunkOffset]
        }
        ;
        LazyUint8Array.prototype.setDataGetter = function LazyUint8Array_setDataGetter(getter) {
            this.getter = getter
        }
        ;
        LazyUint8Array.prototype.cacheLength = function LazyUint8Array_cacheLength() {
            var xhr = new XMLHttpRequest;
            xhr.open("HEAD", url, false);
            xhr.send(null);
            if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304))
                throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
            var datalength = Number(xhr.getResponseHeader("Content-length"));
            var header;
            var hasByteServing = (header = xhr.getResponseHeader("Accept-Ranges")) && header === "bytes";
            var usesGzip = (header = xhr.getResponseHeader("Content-Encoding")) && header === "gzip";
            var chunkSize = 1024 * 1024;
            if (!hasByteServing)
                chunkSize = datalength;
            var doXHR = function(from, to) {
                if (from > to)
                    throw new Error("invalid range (" + from + ", " + to + ") or no bytes requested!");
                if (to > datalength - 1)
                    throw new Error("only " + datalength + " bytes available! programmer error!");
                var xhr = new XMLHttpRequest;
                xhr.open("GET", url, false);
                if (datalength !== chunkSize)
                    xhr.setRequestHeader("Range", "bytes=" + from + "-" + to);
                if (typeof Uint8Array != "undefined")
                    xhr.responseType = "arraybuffer";
                if (xhr.overrideMimeType) {
                    xhr.overrideMimeType("text/plain; charset=x-user-defined")
                }
                xhr.send(null);
                if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304))
                    throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
                if (xhr.response !== undefined) {
                    return new Uint8Array(xhr.response || [])
                } else {
                    return intArrayFromString(xhr.responseText || "", true)
                }
            };
            var lazyArray = this;
            lazyArray.setDataGetter(function(chunkNum) {
                var start = chunkNum * chunkSize;
                var end = (chunkNum + 1) * chunkSize - 1;
                end = Math.min(end, datalength - 1);
                if (typeof lazyArray.chunks[chunkNum] === "undefined") {
                    lazyArray.chunks[chunkNum] = doXHR(start, end)
                }
                if (typeof lazyArray.chunks[chunkNum] === "undefined")
                    throw new Error("doXHR failed!");
                return lazyArray.chunks[chunkNum]
            });
            if (usesGzip || !datalength) {
                chunkSize = datalength = 1;
                datalength = this.getter(0).length;
                chunkSize = datalength;
                console.log("LazyFiles on gzip forces download of the whole file when length is accessed")
            }
            this._length = datalength;
            this._chunkSize = chunkSize;
            this.lengthKnown = true
        }
        ;
        if (typeof XMLHttpRequest !== "undefined") {
            if (!ENVIRONMENT_IS_WORKER)
                throw "Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc";
            var lazyArray = new LazyUint8Array;
            Object.defineProperties(lazyArray, {
                length: {
                    get: function() {
                        if (!this.lengthKnown) {
                            this.cacheLength()
                        }
                        return this._length
                    }
                },
                chunkSize: {
                    get: function() {
                        if (!this.lengthKnown) {
                            this.cacheLength()
                        }
                        return this._chunkSize
                    }
                }
            });
            var properties = {
                isDevice: false,
                contents: lazyArray
            }
        } else {
            var properties = {
                isDevice: false,
                url: url
            }
        }
        var node = FS.createFile(parent, name, properties, canRead, canWrite);
        if (properties.contents) {
            node.contents = properties.contents
        } else if (properties.url) {
            node.contents = null;
            node.url = properties.url
        }
        Object.defineProperties(node, {
            usedBytes: {
                get: function() {
                    return this.contents.length
                }
            }
        });
        var stream_ops = {};
        var keys = Object.keys(node.stream_ops);
        keys.forEach(function(key) {
            var fn = node.stream_ops[key];
            stream_ops[key] = function forceLoadLazyFile() {
                if (!FS.forceLoadFile(node)) {
                    throw new FS.ErrnoError(5)
                }
                return fn.apply(null, arguments)
            }
        });
        stream_ops.read = function stream_ops_read(stream, buffer, offset, length, position) {
            if (!FS.forceLoadFile(node)) {
                throw new FS.ErrnoError(5)
            }
            var contents = stream.node.contents;
            if (position >= contents.length)
                return 0;
            var size = Math.min(contents.length - position, length);
            if (contents.slice) {
                for (var i = 0; i < size; i++) {
                    buffer[offset + i] = contents[position + i]
                }
            } else {
                for (var i = 0; i < size; i++) {
                    buffer[offset + i] = contents.get(position + i)
                }
            }
            return size
        }
        ;
        node.stream_ops = stream_ops;
        return node
    },
    createPreloadedFile: function(parent, name, url, canRead, canWrite, onload, onerror, dontCreateFile, canOwn, preFinish) {
        Browser.init();
        var fullname = name ? PATH_FS.resolve(PATH.join2(parent, name)) : parent;
        var dep = getUniqueRunDependency("cp " + fullname);
        function processData(byteArray) {
            function finish(byteArray) {
                if (preFinish)
                    preFinish();
                if (!dontCreateFile) {
                    FS.createDataFile(parent, name, byteArray, canRead, canWrite, canOwn)
                }
                if (onload)
                    onload();
                removeRunDependency(dep)
            }
            var handled = false;
            Module["preloadPlugins"].forEach(function(plugin) {
                if (handled)
                    return;
                if (plugin["canHandle"](fullname)) {
                    plugin["handle"](byteArray, fullname, finish, function() {
                        if (onerror)
                            onerror();
                        removeRunDependency(dep)
                    });
                    handled = true
                }
            });
            if (!handled)
                finish(byteArray)
        }
        addRunDependency(dep);
        if (typeof url == "string") {
            Browser.asyncLoad(url, function(byteArray) {
                processData(byteArray)
            }, onerror)
        } else {
            processData(url)
        }
    },
    indexedDB: function() {
        return window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB
    },
    DB_NAME: function() {
        return "EM_FS_" + window.location.pathname
    },
    DB_VERSION: 20,
    DB_STORE_NAME: "FILE_DATA",
    saveFilesToDB: function(paths, onload, onerror) {
        onload = onload || function() {}
        ;
        onerror = onerror || function() {}
        ;
        var indexedDB = FS.indexedDB();
        try {
            var openRequest = indexedDB.open(FS.DB_NAME(), FS.DB_VERSION)
        } catch (e) {
            return onerror(e)
        }
        openRequest.onupgradeneeded = function openRequest_onupgradeneeded() {
            console.log("creating db");
            var db = openRequest.result;
            db.createObjectStore(FS.DB_STORE_NAME)
        }
        ;
        openRequest.onsuccess = function openRequest_onsuccess() {
            var db = openRequest.result;
            var transaction = db.transaction([FS.DB_STORE_NAME], "readwrite");
            var files = transaction.objectStore(FS.DB_STORE_NAME);
            var ok = 0
              , fail = 0
              , total = paths.length;
            function finish() {
                if (fail == 0)
                    onload();
                else
                    onerror()
            }
            paths.forEach(function(path) {
                var putRequest = files.put(FS.analyzePath(path).object.contents, path);
                putRequest.onsuccess = function putRequest_onsuccess() {
                    ok++;
                    if (ok + fail == total)
                        finish()
                }
                ;
                putRequest.onerror = function putRequest_onerror() {
                    fail++;
                    if (ok + fail == total)
                        finish()
                }
            });
            transaction.onerror = onerror
        }
        ;
        openRequest.onerror = onerror
    },
    loadFilesFromDB: function(paths, onload, onerror) {
        onload = onload || function() {}
        ;
        onerror = onerror || function() {}
        ;
        var indexedDB = FS.indexedDB();
        try {
            var openRequest = indexedDB.open(FS.DB_NAME(), FS.DB_VERSION)
        } catch (e) {
            return onerror(e)
        }
        openRequest.onupgradeneeded = onerror;
        openRequest.onsuccess = function openRequest_onsuccess() {
            var db = openRequest.result;
            try {
                var transaction = db.transaction([FS.DB_STORE_NAME], "readonly")
            } catch (e) {
                onerror(e);
                return
            }
            var files = transaction.objectStore(FS.DB_STORE_NAME);
            var ok = 0
              , fail = 0
              , total = paths.length;
            function finish() {
                if (fail == 0)
                    onload();
                else
                    onerror()
            }
            paths.forEach(function(path) {
                var getRequest = files.get(path);
                getRequest.onsuccess = function getRequest_onsuccess() {
                    if (FS.analyzePath(path).exists) {
                        FS.unlink(path)
                    }
                    FS.createDataFile(PATH.dirname(path), PATH.basename(path), getRequest.result, true, true, true);
                    ok++;
                    if (ok + fail == total)
                        finish()
                }
                ;
                getRequest.onerror = function getRequest_onerror() {
                    fail++;
                    if (ok + fail == total)
                        finish()
                }
            });
            transaction.onerror = onerror
        }
        ;
        openRequest.onerror = onerror
    }
};
var SYSCALLS = {
    DEFAULT_POLLMASK: 5,
    mappings: {},
    umask: 511,
    calculateAt: function(dirfd, path) {
        if (path[0] !== "/") {
            var dir;
            if (dirfd === -100) {
                dir = FS.cwd()
            } else {
                var dirstream = FS.getStream(dirfd);
                if (!dirstream)
                    throw new FS.ErrnoError(9);
                dir = dirstream.path
            }
            path = PATH.join2(dir, path)
        }
        return path
    },
    doStat: function(func, path, buf) {
        try {
            var stat = func(path)
        } catch (e) {
            if (e && e.node && PATH.normalize(path) !== PATH.normalize(FS.getPath(e.node))) {
                return -20
            }
            throw e
        }
        HEAP32[buf >> 2] = stat.dev;
        HEAP32[buf + 4 >> 2] = 0;
        HEAP32[buf + 8 >> 2] = stat.ino;
        HEAP32[buf + 12 >> 2] = stat.mode;
        HEAP32[buf + 16 >> 2] = stat.nlink;
        HEAP32[buf + 20 >> 2] = stat.uid;
        HEAP32[buf + 24 >> 2] = stat.gid;
        HEAP32[buf + 28 >> 2] = stat.rdev;
        HEAP32[buf + 32 >> 2] = 0;
        tempI64 = [stat.size >>> 0, (tempDouble = stat.size,
        +Math_abs(tempDouble) >= 1 ? tempDouble > 0 ? (Math_min(+Math_floor(tempDouble / 4294967296), 4294967295) | 0) >>> 0 : ~~+Math_ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>> 0 : 0)],
        HEAP32[buf + 40 >> 2] = tempI64[0],
        HEAP32[buf + 44 >> 2] = tempI64[1];
        HEAP32[buf + 48 >> 2] = 4096;
        HEAP32[buf + 52 >> 2] = stat.blocks;
        HEAP32[buf + 56 >> 2] = stat.atime.getTime() / 1e3 | 0;
        HEAP32[buf + 60 >> 2] = 0;
        HEAP32[buf + 64 >> 2] = stat.mtime.getTime() / 1e3 | 0;
        HEAP32[buf + 68 >> 2] = 0;
        HEAP32[buf + 72 >> 2] = stat.ctime.getTime() / 1e3 | 0;
        HEAP32[buf + 76 >> 2] = 0;
        tempI64 = [stat.ino >>> 0, (tempDouble = stat.ino,
        +Math_abs(tempDouble) >= 1 ? tempDouble > 0 ? (Math_min(+Math_floor(tempDouble / 4294967296), 4294967295) | 0) >>> 0 : ~~+Math_ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>> 0 : 0)],
        HEAP32[buf + 80 >> 2] = tempI64[0],
        HEAP32[buf + 84 >> 2] = tempI64[1];
        return 0
    },
    doMsync: function(addr, stream, len, flags) {
        var buffer = new Uint8Array(HEAPU8.subarray(addr, addr + len));
        FS.msync(stream, buffer, 0, len, flags)
    },
    doMkdir: function(path, mode) {
        path = PATH.normalize(path);
        if (path[path.length - 1] === "/")
            path = path.substr(0, path.length - 1);
        FS.mkdir(path, mode, 0);
        return 0
    },
    doMknod: function(path, mode, dev) {
        switch (mode & 61440) {
        case 32768:
        case 8192:
        case 24576:
        case 4096:
        case 49152:
            break;
        default:
            return -22
        }
        FS.mknod(path, mode, dev);
        return 0
    },
    doReadlink: function(path, buf, bufsize) {
        if (bufsize <= 0)
            return -22;
        var ret = FS.readlink(path);
        var len = Math.min(bufsize, lengthBytesUTF8(ret));
        var endChar = HEAP8[buf + len];
        stringToUTF8(ret, buf, bufsize + 1);
        HEAP8[buf + len] = endChar;
        return len
    },
    doAccess: function(path, amode) {
        if (amode & ~7) {
            return -22
        }
        var node;
        var lookup = FS.lookupPath(path, {
            follow: true
        });
        node = lookup.node;
        var perms = "";
        if (amode & 4)
            perms += "r";
        if (amode & 2)
            perms += "w";
        if (amode & 1)
            perms += "x";
        if (perms && FS.nodePermissions(node, perms)) {
            return -13
        }
        return 0
    },
    doDup: function(path, flags, suggestFD) {
        var suggest = FS.getStream(suggestFD);
        if (suggest)
            FS.close(suggest);
        return FS.open(path, flags, 0, suggestFD, suggestFD).fd
    },
    doReadv: function(stream, iov, iovcnt, offset) {
        var ret = 0;
        for (var i = 0; i < iovcnt; i++) {
            var ptr = HEAP32[iov + i * 8 >> 2];
            var len = HEAP32[iov + (i * 8 + 4) >> 2];
            var curr = FS.read(stream, HEAP8, ptr, len, offset);
            if (curr < 0)
                return -1;
            ret += curr;
            if (curr < len)
                break
        }
        return ret
    },
    doWritev: function(stream, iov, iovcnt, offset) {
        var ret = 0;
        for (var i = 0; i < iovcnt; i++) {
            var ptr = HEAP32[iov + i * 8 >> 2];
            var len = HEAP32[iov + (i * 8 + 4) >> 2];
            var curr = FS.write(stream, HEAP8, ptr, len, offset);
            if (curr < 0)
                return -1;
            ret += curr
        }
        return ret
    },
    varargs: 0,
    get: function(varargs) {
        SYSCALLS.varargs += 4;
        var ret = HEAP32[SYSCALLS.varargs - 4 >> 2];
        return ret
    },
    getStr: function() {
        var ret = UTF8ToString(SYSCALLS.get());
        return ret
    },
    getStreamFromFD: function() {
        var stream = FS.getStream(SYSCALLS.get());
        if (!stream)
            throw new FS.ErrnoError(9);
        return stream
    },
    get64: function() {
        var low = SYSCALLS.get()
          , high = SYSCALLS.get();
        return low
    },
    getZero: function() {
        SYSCALLS.get()
    }
};
function ___syscall10(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var path = SYSCALLS.getStr();
        FS.unlink(path);
        return 0
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError))
            abort(e);
        return -e.errno
    }
}
var ERRNO_CODES = {
    EPERM: 1,
    ENOENT: 2,
    ESRCH: 3,
    EINTR: 4,
    EIO: 5,
    ENXIO: 6,
    E2BIG: 7,
    ENOEXEC: 8,
    EBADF: 9,
    ECHILD: 10,
    EAGAIN: 11,
    EWOULDBLOCK: 11,
    ENOMEM: 12,
    EACCES: 13,
    EFAULT: 14,
    ENOTBLK: 15,
    EBUSY: 16,
    EEXIST: 17,
    EXDEV: 18,
    ENODEV: 19,
    ENOTDIR: 20,
    EISDIR: 21,
    EINVAL: 22,
    ENFILE: 23,
    EMFILE: 24,
    ENOTTY: 25,
    ETXTBSY: 26,
    EFBIG: 27,
    ENOSPC: 28,
    ESPIPE: 29,
    EROFS: 30,
    EMLINK: 31,
    EPIPE: 32,
    EDOM: 33,
    ERANGE: 34,
    ENOMSG: 42,
    EIDRM: 43,
    ECHRNG: 44,
    EL2NSYNC: 45,
    EL3HLT: 46,
    EL3RST: 47,
    ELNRNG: 48,
    EUNATCH: 49,
    ENOCSI: 50,
    EL2HLT: 51,
    EDEADLK: 35,
    ENOLCK: 37,
    EBADE: 52,
    EBADR: 53,
    EXFULL: 54,
    ENOANO: 55,
    EBADRQC: 56,
    EBADSLT: 57,
    EDEADLOCK: 35,
    EBFONT: 59,
    ENOSTR: 60,
    ENODATA: 61,
    ETIME: 62,
    ENOSR: 63,
    ENONET: 64,
    ENOPKG: 65,
    EREMOTE: 66,
    ENOLINK: 67,
    EADV: 68,
    ESRMNT: 69,
    ECOMM: 70,
    EPROTO: 71,
    EMULTIHOP: 72,
    EDOTDOT: 73,
    EBADMSG: 74,
    ENOTUNIQ: 76,
    EBADFD: 77,
    EREMCHG: 78,
    ELIBACC: 79,
    ELIBBAD: 80,
    ELIBSCN: 81,
    ELIBMAX: 82,
    ELIBEXEC: 83,
    ENOSYS: 38,
    ENOTEMPTY: 39,
    ENAMETOOLONG: 36,
    ELOOP: 40,
    EOPNOTSUPP: 95,
    EPFNOSUPPORT: 96,
    ECONNRESET: 104,
    ENOBUFS: 105,
    EAFNOSUPPORT: 97,
    EPROTOTYPE: 91,
    ENOTSOCK: 88,
    ENOPROTOOPT: 92,
    ESHUTDOWN: 108,
    ECONNREFUSED: 111,
    EADDRINUSE: 98,
    ECONNABORTED: 103,
    ENETUNREACH: 101,
    ENETDOWN: 100,
    ETIMEDOUT: 110,
    EHOSTDOWN: 112,
    EHOSTUNREACH: 113,
    EINPROGRESS: 115,
    EALREADY: 114,
    EDESTADDRREQ: 89,
    EMSGSIZE: 90,
    EPROTONOSUPPORT: 93,
    ESOCKTNOSUPPORT: 94,
    EADDRNOTAVAIL: 99,
    ENETRESET: 102,
    EISCONN: 106,
    ENOTCONN: 107,
    ETOOMANYREFS: 109,
    EUSERS: 87,
    EDQUOT: 122,
    ESTALE: 116,
    ENOTSUP: 95,
    ENOMEDIUM: 123,
    EILSEQ: 84,
    EOVERFLOW: 75,
    ECANCELED: 125,
    ENOTRECOVERABLE: 131,
    EOWNERDEAD: 130,
    ESTRPIPE: 86
};
var SOCKFS = {
    mount: function(mount) {
        Module["websocket"] = Module["websocket"] && "object" === typeof Module["websocket"] ? Module["websocket"] : {};
        Module["websocket"]._callbacks = {};
        Module["websocket"]["on"] = function(event, callback) {
            if ("function" === typeof callback) {
                this._callbacks[event] = callback
            }
            return this
        }
        ;
        Module["websocket"].emit = function(event, param) {
            if ("function" === typeof this._callbacks[event]) {
                this._callbacks[event].call(this, param)
            }
        }
        ;
        return FS.createNode(null, "/", 16384 | 511, 0)
    },
    createSocket: function(family, type, protocol) {
        var streaming = type == 1;
        if (protocol) {
            assert(streaming == (protocol == 6))
        }
        var sock = {
            family: family,
            type: type,
            protocol: protocol,
            server: null,
            error: null,
            peers: {},
            pending: [],
            recv_queue: [],
            sock_ops: SOCKFS.websocket_sock_ops
        };
        var name = SOCKFS.nextname();
        var node = FS.createNode(SOCKFS.root, name, 49152, 0);
        node.sock = sock;
        var stream = FS.createStream({
            path: name,
            node: node,
            flags: FS.modeStringToFlags("r+"),
            seekable: false,
            stream_ops: SOCKFS.stream_ops
        });
        sock.stream = stream;
        return sock
    },
    getSocket: function(fd) {
        var stream = FS.getStream(fd);
        if (!stream || !FS.isSocket(stream.node.mode)) {
            return null
        }
        return stream.node.sock
    },
    stream_ops: {
        poll: function(stream) {
            var sock = stream.node.sock;
            return sock.sock_ops.poll(sock)
        },
        ioctl: function(stream, request, varargs) {
            var sock = stream.node.sock;
            return sock.sock_ops.ioctl(sock, request, varargs)
        },
        read: function(stream, buffer, offset, length, position) {
            var sock = stream.node.sock;
            var msg = sock.sock_ops.recvmsg(sock, length);
            if (!msg) {
                return 0
            }
            buffer.set(msg.buffer, offset);
            return msg.buffer.length
        },
        write: function(stream, buffer, offset, length, position) {
            var sock = stream.node.sock;
            return sock.sock_ops.sendmsg(sock, buffer, offset, length)
        },
        close: function(stream) {
            var sock = stream.node.sock;
            sock.sock_ops.close(sock)
        }
    },
    nextname: function() {
        if (!SOCKFS.nextname.current) {
            SOCKFS.nextname.current = 0
        }
        return "socket[" + SOCKFS.nextname.current++ + "]"
    },
    websocket_sock_ops: {
        createPeer: function(sock, addr, port) {
            var ws;
            if (typeof addr === "object") {
                ws = addr;
                addr = null;
                port = null
            }
            if (ws) {
                if (ws._socket) {
                    addr = ws._socket.remoteAddress;
                    port = ws._socket.remotePort
                } else {
                    var result = /ws[s]?:\/\/([^:]+):(\d+)/.exec(ws.url);
                    if (!result) {
                        throw new Error("WebSocket URL must be in the format ws(s)://address:port")
                    }
                    addr = result[1];
                    port = parseInt(result[2], 10)
                }
            } else {
                try {
                    var runtimeConfig = Module["websocket"] && "object" === typeof Module["websocket"];
                    var url = "ws:#".replace("#", "//");
                    if (runtimeConfig) {
                        if ("string" === typeof Module["websocket"]["url"]) {
                            url = Module["websocket"]["url"]
                        }
                    }
                    if (url === "ws://" || url === "wss://") {
                        var parts = addr.split("/");
                        url = url + parts[0] + ":" + port + "/" + parts.slice(1).join("/")
                    }
                    var subProtocols = "binary";
                    if (runtimeConfig) {
                        if ("string" === typeof Module["websocket"]["subprotocol"]) {
                            subProtocols = Module["websocket"]["subprotocol"]
                        }
                    }
                    subProtocols = subProtocols.replace(/^ +| +$/g, "").split(/ *, */);
                    var opts = ENVIRONMENT_IS_NODE ? {
                        "protocol": subProtocols.toString()
                    } : subProtocols;
                    if (runtimeConfig && null === Module["websocket"]["subprotocol"]) {
                        subProtocols = "null";
                        opts = undefined
                    }
                    var WebSocketConstructor;
                    if (ENVIRONMENT_IS_NODE) {
                        WebSocketConstructor = require("ws")
                    } else if (ENVIRONMENT_IS_WEB) {
                        WebSocketConstructor = window["WebSocket"]
                    } else {
                        WebSocketConstructor = WebSocket
                    }
                    ws = new WebSocketConstructor(url,opts);
                    ws.binaryType = "arraybuffer"
                } catch (e) {
                    throw new FS.ErrnoError(ERRNO_CODES.EHOSTUNREACH)
                }
            }
            var peer = {
                addr: addr,
                port: port,
                socket: ws,
                dgram_send_queue: []
            };
            SOCKFS.websocket_sock_ops.addPeer(sock, peer);
            SOCKFS.websocket_sock_ops.handlePeerEvents(sock, peer);
            if (sock.type === 2 && typeof sock.sport !== "undefined") {
                peer.dgram_send_queue.push(new Uint8Array([255, 255, 255, 255, "p".charCodeAt(0), "o".charCodeAt(0), "r".charCodeAt(0), "t".charCodeAt(0), (sock.sport & 65280) >> 8, sock.sport & 255]))
            }
            return peer
        },
        getPeer: function(sock, addr, port) {
            return sock.peers[addr + ":" + port]
        },
        addPeer: function(sock, peer) {
            sock.peers[peer.addr + ":" + peer.port] = peer
        },
        removePeer: function(sock, peer) {
            delete sock.peers[peer.addr + ":" + peer.port]
        },
        handlePeerEvents: function(sock, peer) {
            var first = true;
            var handleOpen = function() {
                Module["websocket"].emit("open", sock.stream.fd);
                try {
                    var queued = peer.dgram_send_queue.shift();
                    while (queued) {
                        peer.socket.send(queued);
                        queued = peer.dgram_send_queue.shift()
                    }
                } catch (e) {
                    peer.socket.close()
                }
            };
            function handleMessage(data) {
                assert(typeof data !== "string" && data.byteLength !== undefined);
                if (data.byteLength == 0) {
                    return
                }
                data = new Uint8Array(data);
                var wasfirst = first;
                first = false;
                if (wasfirst && data.length === 10 && data[0] === 255 && data[1] === 255 && data[2] === 255 && data[3] === 255 && data[4] === "p".charCodeAt(0) && data[5] === "o".charCodeAt(0) && data[6] === "r".charCodeAt(0) && data[7] === "t".charCodeAt(0)) {
                    var newport = data[8] << 8 | data[9];
                    SOCKFS.websocket_sock_ops.removePeer(sock, peer);
                    peer.port = newport;
                    SOCKFS.websocket_sock_ops.addPeer(sock, peer);
                    return
                }
                sock.recv_queue.push({
                    addr: peer.addr,
                    port: peer.port,
                    data: data
                });
                Module["websocket"].emit("message", sock.stream.fd)
            }
            if (ENVIRONMENT_IS_NODE) {
                peer.socket.on("open", handleOpen);
                peer.socket.on("message", function(data, flags) {
                    if (!flags.binary) {
                        return
                    }
                    handleMessage(new Uint8Array(data).buffer)
                });
                peer.socket.on("close", function() {
                    Module["websocket"].emit("close", sock.stream.fd)
                });
                peer.socket.on("error", function(error) {
                    sock.error = ERRNO_CODES.ECONNREFUSED;
                    Module["websocket"].emit("error", [sock.stream.fd, sock.error, "ECONNREFUSED: Connection refused"])
                })
            } else {
                peer.socket.onopen = handleOpen;
                peer.socket.onclose = function() {
                    Module["websocket"].emit("close", sock.stream.fd)
                }
                ;
                peer.socket.onmessage = function peer_socket_onmessage(event) {
                    handleMessage(event.data)
                }
                ;
                peer.socket.onerror = function(error) {
                    sock.error = ERRNO_CODES.ECONNREFUSED;
                    Module["websocket"].emit("error", [sock.stream.fd, sock.error, "ECONNREFUSED: Connection refused"])
                }
            }
        },
        poll: function(sock) {
            if (sock.type === 1 && sock.server) {
                return sock.pending.length ? 64 | 1 : 0
            }
            var mask = 0;
            var dest = sock.type === 1 ? SOCKFS.websocket_sock_ops.getPeer(sock, sock.daddr, sock.dport) : null;
            if (sock.recv_queue.length || !dest || dest && dest.socket.readyState === dest.socket.CLOSING || dest && dest.socket.readyState === dest.socket.CLOSED) {
                mask |= 64 | 1
            }
            if (!dest || dest && dest.socket.readyState === dest.socket.OPEN) {
                mask |= 4
            }
            if (dest && dest.socket.readyState === dest.socket.CLOSING || dest && dest.socket.readyState === dest.socket.CLOSED) {
                mask |= 16
            }
            return mask
        },
        ioctl: function(sock, request, arg) {
            switch (request) {
            case 21531:
                var bytes = 0;
                if (sock.recv_queue.length) {
                    bytes = sock.recv_queue[0].data.length
                }
                HEAP32[arg >> 2] = bytes;
                return 0;
            default:
                return ERRNO_CODES.EINVAL
            }
        },
        close: function(sock) {
            if (sock.server) {
                try {
                    sock.server.close()
                } catch (e) {}
                sock.server = null
            }
            var peers = Object.keys(sock.peers);
            for (var i = 0; i < peers.length; i++) {
                var peer = sock.peers[peers[i]];
                try {
                    peer.socket.close()
                } catch (e) {}
                SOCKFS.websocket_sock_ops.removePeer(sock, peer)
            }
            return 0
        },
        bind: function(sock, addr, port) {
            if (typeof sock.saddr !== "undefined" || typeof sock.sport !== "undefined") {
                throw new FS.ErrnoError(ERRNO_CODES.EINVAL)
            }
            sock.saddr = addr;
            sock.sport = port;
            if (sock.type === 2) {
                if (sock.server) {
                    sock.server.close();
                    sock.server = null
                }
                try {
                    sock.sock_ops.listen(sock, 0)
                } catch (e) {
                    if (!(e instanceof FS.ErrnoError))
                        throw e;
                    if (e.errno !== ERRNO_CODES.EOPNOTSUPP)
                        throw e
                }
            }
        },
        connect: function(sock, addr, port) {
            if (sock.server) {
                throw new FS.ErrnoError(ERRNO_CODES.EOPNOTSUPP)
            }
            if (typeof sock.daddr !== "undefined" && typeof sock.dport !== "undefined") {
                var dest = SOCKFS.websocket_sock_ops.getPeer(sock, sock.daddr, sock.dport);
                if (dest) {
                    if (dest.socket.readyState === dest.socket.CONNECTING) {
                        throw new FS.ErrnoError(ERRNO_CODES.EALREADY)
                    } else {
                        throw new FS.ErrnoError(ERRNO_CODES.EISCONN)
                    }
                }
            }
            var peer = SOCKFS.websocket_sock_ops.createPeer(sock, addr, port);
            sock.daddr = peer.addr;
            sock.dport = peer.port;
            throw new FS.ErrnoError(ERRNO_CODES.EINPROGRESS)
        },
        listen: function(sock, backlog) {
            if (!ENVIRONMENT_IS_NODE) {
                throw new FS.ErrnoError(ERRNO_CODES.EOPNOTSUPP)
            }
            if (sock.server) {
                throw new FS.ErrnoError(ERRNO_CODES.EINVAL)
            }
            var WebSocketServer = require("ws").Server;
            var host = sock.saddr;
            sock.server = new WebSocketServer({
                host: host,
                port: sock.sport
            });
            Module["websocket"].emit("listen", sock.stream.fd);
            sock.server.on("connection", function(ws) {
                if (sock.type === 1) {
                    var newsock = SOCKFS.createSocket(sock.family, sock.type, sock.protocol);
                    var peer = SOCKFS.websocket_sock_ops.createPeer(newsock, ws);
                    newsock.daddr = peer.addr;
                    newsock.dport = peer.port;
                    sock.pending.push(newsock);
                    Module["websocket"].emit("connection", newsock.stream.fd)
                } else {
                    SOCKFS.websocket_sock_ops.createPeer(sock, ws);
                    Module["websocket"].emit("connection", sock.stream.fd)
                }
            });
            sock.server.on("closed", function() {
                Module["websocket"].emit("close", sock.stream.fd);
                sock.server = null
            });
            sock.server.on("error", function(error) {
                sock.error = ERRNO_CODES.EHOSTUNREACH;
                Module["websocket"].emit("error", [sock.stream.fd, sock.error, "EHOSTUNREACH: Host is unreachable"])
            })
        },
        accept: function(listensock) {
            if (!listensock.server) {
                throw new FS.ErrnoError(ERRNO_CODES.EINVAL)
            }
            var newsock = listensock.pending.shift();
            newsock.stream.flags = listensock.stream.flags;
            return newsock
        },
        getname: function(sock, peer) {
            var addr, port;
            if (peer) {
                if (sock.daddr === undefined || sock.dport === undefined) {
                    throw new FS.ErrnoError(ERRNO_CODES.ENOTCONN)
                }
                addr = sock.daddr;
                port = sock.dport
            } else {
                addr = sock.saddr || 0;
                port = sock.sport || 0
            }
            return {
                addr: addr,
                port: port
            }
        },
        sendmsg: function(sock, buffer, offset, length, addr, port) {
            if (sock.type === 2) {
                if (addr === undefined || port === undefined) {
                    addr = sock.daddr;
                    port = sock.dport
                }
                if (addr === undefined || port === undefined) {
                    throw new FS.ErrnoError(ERRNO_CODES.EDESTADDRREQ)
                }
            } else {
                addr = sock.daddr;
                port = sock.dport
            }
            var dest = SOCKFS.websocket_sock_ops.getPeer(sock, addr, port);
            if (sock.type === 1) {
                if (!dest || dest.socket.readyState === dest.socket.CLOSING || dest.socket.readyState === dest.socket.CLOSED) {
                    throw new FS.ErrnoError(ERRNO_CODES.ENOTCONN)
                } else if (dest.socket.readyState === dest.socket.CONNECTING) {
                    throw new FS.ErrnoError(ERRNO_CODES.EAGAIN)
                }
            }
            if (ArrayBuffer.isView(buffer)) {
                offset += buffer.byteOffset;
                buffer = buffer.buffer
            }
            var data;
            data = buffer.slice(offset, offset + length);
            if (sock.type === 2) {
                if (!dest || dest.socket.readyState !== dest.socket.OPEN) {
                    if (!dest || dest.socket.readyState === dest.socket.CLOSING || dest.socket.readyState === dest.socket.CLOSED) {
                        dest = SOCKFS.websocket_sock_ops.createPeer(sock, addr, port)
                    }
                    dest.dgram_send_queue.push(data);
                    return length
                }
            }
            try {
                dest.socket.send(data);
                return length
            } catch (e) {
                throw new FS.ErrnoError(ERRNO_CODES.EINVAL)
            }
        },
        recvmsg: function(sock, length) {
            if (sock.type === 1 && sock.server) {
                throw new FS.ErrnoError(ERRNO_CODES.ENOTCONN)
            }
            var queued = sock.recv_queue.shift();
            if (!queued) {
                if (sock.type === 1) {
                    var dest = SOCKFS.websocket_sock_ops.getPeer(sock, sock.daddr, sock.dport);
                    if (!dest) {
                        throw new FS.ErrnoError(ERRNO_CODES.ENOTCONN)
                    } else if (dest.socket.readyState === dest.socket.CLOSING || dest.socket.readyState === dest.socket.CLOSED) {
                        return null
                    } else {
                        throw new FS.ErrnoError(ERRNO_CODES.EAGAIN)
                    }
                } else {
                    throw new FS.ErrnoError(ERRNO_CODES.EAGAIN)
                }
            }
            var queuedLength = queued.data.byteLength || queued.data.length;
            var queuedOffset = queued.data.byteOffset || 0;
            var queuedBuffer = queued.data.buffer || queued.data;
            var bytesRead = Math.min(length, queuedLength);
            var res = {
                buffer: new Uint8Array(queuedBuffer,queuedOffset,bytesRead),
                addr: queued.addr,
                port: queued.port
            };
            if (sock.type === 1 && bytesRead < queuedLength) {
                var bytesRemaining = queuedLength - bytesRead;
                queued.data = new Uint8Array(queuedBuffer,queuedOffset + bytesRead,bytesRemaining);
                sock.recv_queue.unshift(queued)
            }
            return res
        }
    }
};
function __inet_pton4_raw(str) {
    var b = str.split(".");
    for (var i = 0; i < 4; i++) {
        var tmp = Number(b[i]);
        if (isNaN(tmp))
            return null;
        b[i] = tmp
    }
    return (b[0] | b[1] << 8 | b[2] << 16 | b[3] << 24) >>> 0
}
function __inet_pton6_raw(str) {
    var words;
    var w, offset, z;
    var valid6regx = /^((?=.*::)(?!.*::.+::)(::)?([\dA-F]{1,4}:(:|\b)|){5}|([\dA-F]{1,4}:){6})((([\dA-F]{1,4}((?!\3)::|:\b|$))|(?!\2\3)){2}|(((2[0-4]|1\d|[1-9])?\d|25[0-5])\.?\b){4})$/i;
    var parts = [];
    if (!valid6regx.test(str)) {
        return null
    }
    if (str === "::") {
        return [0, 0, 0, 0, 0, 0, 0, 0]
    }
    if (str.indexOf("::") === 0) {
        str = str.replace("::", "Z:")
    } else {
        str = str.replace("::", ":Z:")
    }
    if (str.indexOf(".") > 0) {
        str = str.replace(new RegExp("[.]","g"), ":");
        words = str.split(":");
        words[words.length - 4] = parseInt(words[words.length - 4]) + parseInt(words[words.length - 3]) * 256;
        words[words.length - 3] = parseInt(words[words.length - 2]) + parseInt(words[words.length - 1]) * 256;
        words = words.slice(0, words.length - 2)
    } else {
        words = str.split(":")
    }
    offset = 0;
    z = 0;
    for (w = 0; w < words.length; w++) {
        if (typeof words[w] === "string") {
            if (words[w] === "Z") {
                for (z = 0; z < 8 - words.length + 1; z++) {
                    parts[w + z] = 0
                }
                offset = z - 1
            } else {
                parts[w + offset] = _htons(parseInt(words[w], 16))
            }
        } else {
            parts[w + offset] = words[w]
        }
    }
    return [parts[1] << 16 | parts[0], parts[3] << 16 | parts[2], parts[5] << 16 | parts[4], parts[7] << 16 | parts[6]]
}
var DNS = {
    address_map: {
        id: 1,
        addrs: {},
        names: {}
    },
    lookup_name: function(name) {
        var res = __inet_pton4_raw(name);
        if (res !== null) {
            return name
        }
        res = __inet_pton6_raw(name);
        if (res !== null) {
            return name
        }
        var addr;
        if (DNS.address_map.addrs[name]) {
            addr = DNS.address_map.addrs[name]
        } else {
            var id = DNS.address_map.id++;
            assert(id < 65535, "exceeded max address mappings of 65535");
            addr = "172.29." + (id & 255) + "." + (id & 65280);
            DNS.address_map.names[addr] = name;
            DNS.address_map.addrs[name] = addr
        }
        return addr
    },
    lookup_addr: function(addr) {
        if (DNS.address_map.names[addr]) {
            return DNS.address_map.names[addr]
        }
        return null
    }
};
function __inet_ntop4_raw(addr) {
    return (addr & 255) + "." + (addr >> 8 & 255) + "." + (addr >> 16 & 255) + "." + (addr >> 24 & 255)
}
function __inet_ntop6_raw(ints) {
    var str = "";
    var word = 0;
    var longest = 0;
    var lastzero = 0;
    var zstart = 0;
    var len = 0;
    var i = 0;
    var parts = [ints[0] & 65535, ints[0] >> 16, ints[1] & 65535, ints[1] >> 16, ints[2] & 65535, ints[2] >> 16, ints[3] & 65535, ints[3] >> 16];
    var hasipv4 = true;
    var v4part = "";
    for (i = 0; i < 5; i++) {
        if (parts[i] !== 0) {
            hasipv4 = false;
            break
        }
    }
    if (hasipv4) {
        v4part = __inet_ntop4_raw(parts[6] | parts[7] << 16);
        if (parts[5] === -1) {
            str = "::ffff:";
            str += v4part;
            return str
        }
        if (parts[5] === 0) {
            str = "::";
            if (v4part === "0.0.0.0")
                v4part = "";
            if (v4part === "0.0.0.1")
                v4part = "1";
            str += v4part;
            return str
        }
    }
    for (word = 0; word < 8; word++) {
        if (parts[word] === 0) {
            if (word - lastzero > 1) {
                len = 0
            }
            lastzero = word;
            len++
        }
        if (len > longest) {
            longest = len;
            zstart = word - longest + 1
        }
    }
    for (word = 0; word < 8; word++) {
        if (longest > 1) {
            if (parts[word] === 0 && word >= zstart && word < zstart + longest) {
                if (word === zstart) {
                    str += ":";
                    if (zstart === 0)
                        str += ":"
                }
                continue
            }
        }
        str += Number(_ntohs(parts[word] & 65535)).toString(16);
        str += word < 7 ? ":" : ""
    }
    return str
}
function __read_sockaddr(sa, salen) {
    var family = HEAP16[sa >> 1];
    var port = _ntohs(HEAP16[sa + 2 >> 1]);
    var addr;
    switch (family) {
    case 2:
        if (salen !== 16) {
            return {
                errno: 22
            }
        }
        addr = HEAP32[sa + 4 >> 2];
        addr = __inet_ntop4_raw(addr);
        break;
    case 10:
        if (salen !== 28) {
            return {
                errno: 22
            }
        }
        addr = [HEAP32[sa + 8 >> 2], HEAP32[sa + 12 >> 2], HEAP32[sa + 16 >> 2], HEAP32[sa + 20 >> 2]];
        addr = __inet_ntop6_raw(addr);
        break;
    default:
        return {
            errno: 97
        }
    }
    return {
        family: family,
        addr: addr,
        port: port
    }
}
function __write_sockaddr(sa, family, addr, port) {
    switch (family) {
    case 2:
        addr = __inet_pton4_raw(addr);
        HEAP16[sa >> 1] = family;
        HEAP32[sa + 4 >> 2] = addr;
        HEAP16[sa + 2 >> 1] = _htons(port);
        break;
    case 10:
        addr = __inet_pton6_raw(addr);
        HEAP32[sa >> 2] = family;
        HEAP32[sa + 8 >> 2] = addr[0];
        HEAP32[sa + 12 >> 2] = addr[1];
        HEAP32[sa + 16 >> 2] = addr[2];
        HEAP32[sa + 20 >> 2] = addr[3];
        HEAP16[sa + 2 >> 1] = _htons(port);
        HEAP32[sa + 4 >> 2] = 0;
        HEAP32[sa + 24 >> 2] = 0;
        break;
    default:
        return {
            errno: 97
        }
    }
    return {}
}
function ___syscall102(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var call = SYSCALLS.get()
          , socketvararg = SYSCALLS.get();
        SYSCALLS.varargs = socketvararg;
        var getSocketFromFD = function() {
            var socket = SOCKFS.getSocket(SYSCALLS.get());
            if (!socket)
                throw new FS.ErrnoError(9);
            return socket
        };
        var getSocketAddress = function(allowNull) {
            var addrp = SYSCALLS.get()
              , addrlen = SYSCALLS.get();
            if (allowNull && addrp === 0)
                return null;
            var info = __read_sockaddr(addrp, addrlen);
            if (info.errno)
                throw new FS.ErrnoError(info.errno);
            info.addr = DNS.lookup_addr(info.addr) || info.addr;
            return info
        };
        switch (call) {
        case 1:
            {
                var domain = SYSCALLS.get()
                  , type = SYSCALLS.get()
                  , protocol = SYSCALLS.get();
                var sock = SOCKFS.createSocket(domain, type, protocol);
                return sock.stream.fd
            }
        case 2:
            {
                var sock = getSocketFromFD()
                  , info = getSocketAddress();
                sock.sock_ops.bind(sock, info.addr, info.port);
                return 0
            }
        case 3:
            {
                var sock = getSocketFromFD()
                  , info = getSocketAddress();
                sock.sock_ops.connect(sock, info.addr, info.port);
                return 0
            }
        case 4:
            {
                var sock = getSocketFromFD()
                  , backlog = SYSCALLS.get();
                sock.sock_ops.listen(sock, backlog);
                return 0
            }
        case 5:
            {
                var sock = getSocketFromFD()
                  , addr = SYSCALLS.get()
                  , addrlen = SYSCALLS.get();
                var newsock = sock.sock_ops.accept(sock);
                if (addr) {
                    var res = __write_sockaddr(addr, newsock.family, DNS.lookup_name(newsock.daddr), newsock.dport)
                }
                return newsock.stream.fd
            }
        case 6:
            {
                var sock = getSocketFromFD()
                  , addr = SYSCALLS.get()
                  , addrlen = SYSCALLS.get();
                var res = __write_sockaddr(addr, sock.family, DNS.lookup_name(sock.saddr || "0.0.0.0"), sock.sport);
                return 0
            }
        case 7:
            {
                var sock = getSocketFromFD()
                  , addr = SYSCALLS.get()
                  , addrlen = SYSCALLS.get();
                if (!sock.daddr) {
                    return -107
                }
                var res = __write_sockaddr(addr, sock.family, DNS.lookup_name(sock.daddr), sock.dport);
                return 0
            }
        case 11:
            {
                var sock = getSocketFromFD()
                  , message = SYSCALLS.get()
                  , length = SYSCALLS.get()
                  , flags = SYSCALLS.get()
                  , dest = getSocketAddress(true);
                if (!dest) {
                    return FS.write(sock.stream, HEAP8, message, length)
                } else {
                    return sock.sock_ops.sendmsg(sock, HEAP8, message, length, dest.addr, dest.port)
                }
            }
        case 12:
            {
                var sock = getSocketFromFD()
                  , buf = SYSCALLS.get()
                  , len = SYSCALLS.get()
                  , flags = SYSCALLS.get()
                  , addr = SYSCALLS.get()
                  , addrlen = SYSCALLS.get();
                var msg = sock.sock_ops.recvmsg(sock, len);
                if (!msg)
                    return 0;
                if (addr) {
                    var res = __write_sockaddr(addr, sock.family, DNS.lookup_name(msg.addr), msg.port)
                }
                HEAPU8.set(msg.buffer, buf);
                return msg.buffer.byteLength
            }
        case 14:
            {
                return -92
            }
        case 15:
            {
                var sock = getSocketFromFD()
                  , level = SYSCALLS.get()
                  , optname = SYSCALLS.get()
                  , optval = SYSCALLS.get()
                  , optlen = SYSCALLS.get();
                if (level === 1) {
                    if (optname === 4) {
                        HEAP32[optval >> 2] = sock.error;
                        HEAP32[optlen >> 2] = 4;
                        sock.error = null;
                        return 0
                    }
                }
                return -92
            }
        case 16:
            {
                var sock = getSocketFromFD()
                  , message = SYSCALLS.get()
                  , flags = SYSCALLS.get();
                var iov = HEAP32[message + 8 >> 2];
                var num = HEAP32[message + 12 >> 2];
                var addr, port;
                var name = HEAP32[message >> 2];
                var namelen = HEAP32[message + 4 >> 2];
                if (name) {
                    var info = __read_sockaddr(name, namelen);
                    if (info.errno)
                        return -info.errno;
                    port = info.port;
                    addr = DNS.lookup_addr(info.addr) || info.addr
                }
                var total = 0;
                for (var i = 0; i < num; i++) {
                    total += HEAP32[iov + (8 * i + 4) >> 2]
                }
                var view = new Uint8Array(total);
                var offset = 0;
                for (var i = 0; i < num; i++) {
                    var iovbase = HEAP32[iov + (8 * i + 0) >> 2];
                    var iovlen = HEAP32[iov + (8 * i + 4) >> 2];
                    for (var j = 0; j < iovlen; j++) {
                        view[offset++] = HEAP8[iovbase + j >> 0]
                    }
                }
                return sock.sock_ops.sendmsg(sock, view, 0, total, addr, port)
            }
        case 17:
            {
                var sock = getSocketFromFD()
                  , message = SYSCALLS.get()
                  , flags = SYSCALLS.get();
                var iov = HEAP32[message + 8 >> 2];
                var num = HEAP32[message + 12 >> 2];
                var total = 0;
                for (var i = 0; i < num; i++) {
                    total += HEAP32[iov + (8 * i + 4) >> 2]
                }
                var msg = sock.sock_ops.recvmsg(sock, total);
                if (!msg)
                    return 0;
                var name = HEAP32[message >> 2];
                if (name) {
                    var res = __write_sockaddr(name, sock.family, DNS.lookup_name(msg.addr), msg.port)
                }
                var bytesRead = 0;
                var bytesRemaining = msg.buffer.byteLength;
                for (var i = 0; bytesRemaining > 0 && i < num; i++) {
                    var iovbase = HEAP32[iov + (8 * i + 0) >> 2];
                    var iovlen = HEAP32[iov + (8 * i + 4) >> 2];
                    if (!iovlen) {
                        continue
                    }
                    var length = Math.min(iovlen, bytesRemaining);
                    var buf = msg.buffer.subarray(bytesRead, bytesRead + length);
                    HEAPU8.set(buf, iovbase + bytesRead);
                    bytesRead += length;
                    bytesRemaining -= length
                }
                return bytesRead
            }
        default:
            abort("unsupported socketcall syscall " + call)
        }
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError))
            abort(e);
        return -e.errno
    }
}
function ___syscall118(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var stream = SYSCALLS.getStreamFromFD();
        if (stream.stream_ops && stream.stream_ops.fsync) {
            return -stream.stream_ops.fsync(stream)
        }
        return 0
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError))
            abort(e);
        return -e.errno
    }
}
function ___syscall12(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var path = SYSCALLS.getStr();
        FS.chdir(path);
        return 0
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError))
            abort(e);
        return -e.errno
    }
}
function ___syscall122(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var buf = SYSCALLS.get();
        if (!buf)
            return -14;
        var layout = {
            "sysname": 0,
            "nodename": 65,
            "domainname": 325,
            "machine": 260,
            "version": 195,
            "release": 130,
            "__size__": 390
        };
        var copyString = function(element, value) {
            var offset = layout[element];
            writeAsciiToMemory(value, buf + offset)
        };
        copyString("sysname", "Emscripten");
        copyString("nodename", "emscripten");
        copyString("release", "1.0");
        copyString("version", "#1");
        copyString("machine", "x86-JS");
        return 0
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError))
            abort(e);
        return -e.errno
    }
}
function ___syscall140(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var stream = SYSCALLS.getStreamFromFD()
          , offset_high = SYSCALLS.get()
          , offset_low = SYSCALLS.get()
          , result = SYSCALLS.get()
          , whence = SYSCALLS.get();
        var HIGH_OFFSET = 4294967296;
        var offset = offset_high * HIGH_OFFSET + (offset_low >>> 0);
        var DOUBLE_LIMIT = 9007199254740992;
        if (offset <= -DOUBLE_LIMIT || offset >= DOUBLE_LIMIT) {
            return -75
        }
        FS.llseek(stream, offset, whence);
        tempI64 = [stream.position >>> 0, (tempDouble = stream.position,
        +Math_abs(tempDouble) >= 1 ? tempDouble > 0 ? (Math_min(+Math_floor(tempDouble / 4294967296), 4294967295) | 0) >>> 0 : ~~+Math_ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>> 0 : 0)],
        HEAP32[result >> 2] = tempI64[0],
        HEAP32[result + 4 >> 2] = tempI64[1];
        if (stream.getdents && offset === 0 && whence === 0)
            stream.getdents = null;
        return 0
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError))
            abort(e);
        return -e.errno
    }
}
function ___syscall142(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var nfds = SYSCALLS.get()
          , readfds = SYSCALLS.get()
          , writefds = SYSCALLS.get()
          , exceptfds = SYSCALLS.get()
          , timeout = SYSCALLS.get();
        var total = 0;
        var srcReadLow = readfds ? HEAP32[readfds >> 2] : 0
          , srcReadHigh = readfds ? HEAP32[readfds + 4 >> 2] : 0;
        var srcWriteLow = writefds ? HEAP32[writefds >> 2] : 0
          , srcWriteHigh = writefds ? HEAP32[writefds + 4 >> 2] : 0;
        var srcExceptLow = exceptfds ? HEAP32[exceptfds >> 2] : 0
          , srcExceptHigh = exceptfds ? HEAP32[exceptfds + 4 >> 2] : 0;
        var dstReadLow = 0
          , dstReadHigh = 0;
        var dstWriteLow = 0
          , dstWriteHigh = 0;
        var dstExceptLow = 0
          , dstExceptHigh = 0;
        var allLow = (readfds ? HEAP32[readfds >> 2] : 0) | (writefds ? HEAP32[writefds >> 2] : 0) | (exceptfds ? HEAP32[exceptfds >> 2] : 0);
        var allHigh = (readfds ? HEAP32[readfds + 4 >> 2] : 0) | (writefds ? HEAP32[writefds + 4 >> 2] : 0) | (exceptfds ? HEAP32[exceptfds + 4 >> 2] : 0);
        var check = function(fd, low, high, val) {
            return fd < 32 ? low & val : high & val
        };
        for (var fd = 0; fd < nfds; fd++) {
            var mask = 1 << fd % 32;
            if (!check(fd, allLow, allHigh, mask)) {
                continue
            }
            var stream = FS.getStream(fd);
            if (!stream)
                throw new FS.ErrnoError(9);
            var flags = SYSCALLS.DEFAULT_POLLMASK;
            if (stream.stream_ops.poll) {
                flags = stream.stream_ops.poll(stream)
            }
            if (flags & 1 && check(fd, srcReadLow, srcReadHigh, mask)) {
                fd < 32 ? dstReadLow = dstReadLow | mask : dstReadHigh = dstReadHigh | mask;
                total++
            }
            if (flags & 4 && check(fd, srcWriteLow, srcWriteHigh, mask)) {
                fd < 32 ? dstWriteLow = dstWriteLow | mask : dstWriteHigh = dstWriteHigh | mask;
                total++
            }
            if (flags & 2 && check(fd, srcExceptLow, srcExceptHigh, mask)) {
                fd < 32 ? dstExceptLow = dstExceptLow | mask : dstExceptHigh = dstExceptHigh | mask;
                total++
            }
        }
        if (readfds) {
            HEAP32[readfds >> 2] = dstReadLow;
            HEAP32[readfds + 4 >> 2] = dstReadHigh
        }
        if (writefds) {
            HEAP32[writefds >> 2] = dstWriteLow;
            HEAP32[writefds + 4 >> 2] = dstWriteHigh
        }
        if (exceptfds) {
            HEAP32[exceptfds >> 2] = dstExceptLow;
            HEAP32[exceptfds + 4 >> 2] = dstExceptHigh
        }
        return total
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError))
            abort(e);
        return -e.errno
    }
}
function ___syscall144(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var addr = SYSCALLS.get()
          , len = SYSCALLS.get()
          , flags = SYSCALLS.get();
        var info = SYSCALLS.mappings[addr];
        if (!info)
            return 0;
        SYSCALLS.doMsync(addr, FS.getStream(info.fd), len, info.flags);
        return 0
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError))
            abort(e);
        return -e.errno
    }
}
function ___syscall145(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var stream = SYSCALLS.getStreamFromFD()
          , iov = SYSCALLS.get()
          , iovcnt = SYSCALLS.get();
        return SYSCALLS.doReadv(stream, iov, iovcnt)
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError))
            abort(e);
        return -e.errno
    }
}
function ___syscall146(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var stream = SYSCALLS.getStreamFromFD()
          , iov = SYSCALLS.get()
          , iovcnt = SYSCALLS.get();
        return SYSCALLS.doWritev(stream, iov, iovcnt)
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError))
            abort(e);
        return -e.errno
    }
}
function ___syscall15(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var path = SYSCALLS.getStr()
          , mode = SYSCALLS.get();
        FS.chmod(path, mode);
        return 0
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError))
            abort(e);
        return -e.errno
    }
}
function ___syscall168(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var fds = SYSCALLS.get()
          , nfds = SYSCALLS.get()
          , timeout = SYSCALLS.get();
        var nonzero = 0;
        for (var i = 0; i < nfds; i++) {
            var pollfd = fds + 8 * i;
            var fd = HEAP32[pollfd >> 2];
            var events = HEAP16[pollfd + 4 >> 1];
            var mask = 32;
            var stream = FS.getStream(fd);
            if (stream) {
                mask = SYSCALLS.DEFAULT_POLLMASK;
                if (stream.stream_ops.poll) {
                    mask = stream.stream_ops.poll(stream)
                }
            }
            mask &= events | 8 | 16;
            if (mask)
                nonzero++;
            HEAP16[pollfd + 6 >> 1] = mask
        }
        return nonzero
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError))
            abort(e);
        return -e.errno
    }
}
function ___syscall183(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var buf = SYSCALLS.get()
          , size = SYSCALLS.get();
        if (size === 0)
            return -22;
        var cwd = FS.cwd();
        var cwdLengthInBytes = lengthBytesUTF8(cwd);
        if (size < cwdLengthInBytes + 1)
            return -34;
        stringToUTF8(cwd, buf, size);
        return buf
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError))
            abort(e);
        return -e.errno
    }
}
function _memset(ptr, value, num) {
    ptr = ptr | 0;
    value = value | 0;
    num = num | 0;
    var end = 0
      , aligned_end = 0
      , block_aligned_end = 0
      , value4 = 0;
    end = ptr + num | 0;
    value = value & 255;
    if ((num | 0) >= 67) {
        while ((ptr & 3) != 0) {
            HEAP8[ptr >> 0] = value;
            ptr = ptr + 1 | 0
        }
        aligned_end = end & -4 | 0;
        value4 = value | value << 8 | value << 16 | value << 24;
        block_aligned_end = aligned_end - 64 | 0;
        while ((ptr | 0) <= (block_aligned_end | 0)) {
            HEAP32[ptr >> 2] = value4;
            HEAP32[ptr + 4 >> 2] = value4;
            HEAP32[ptr + 8 >> 2] = value4;
            HEAP32[ptr + 12 >> 2] = value4;
            HEAP32[ptr + 16 >> 2] = value4;
            HEAP32[ptr + 20 >> 2] = value4;
            HEAP32[ptr + 24 >> 2] = value4;
            HEAP32[ptr + 28 >> 2] = value4;
            HEAP32[ptr + 32 >> 2] = value4;
            HEAP32[ptr + 36 >> 2] = value4;
            HEAP32[ptr + 40 >> 2] = value4;
            HEAP32[ptr + 44 >> 2] = value4;
            HEAP32[ptr + 48 >> 2] = value4;
            HEAP32[ptr + 52 >> 2] = value4;
            HEAP32[ptr + 56 >> 2] = value4;
            HEAP32[ptr + 60 >> 2] = value4;
            ptr = ptr + 64 | 0
        }
        while ((ptr | 0) < (aligned_end | 0)) {
            HEAP32[ptr >> 2] = value4;
            ptr = ptr + 4 | 0
        }
    }
    while ((ptr | 0) < (end | 0)) {
        HEAP8[ptr >> 0] = value;
        ptr = ptr + 1 | 0
    }
    return end - num | 0
}
function __emscripten_syscall_mmap2(addr, len, prot, flags, fd, off) {
    off <<= 12;
    var ptr;
    var allocated = false;
    if ((flags & 16) !== 0 && addr % PAGE_SIZE !== 0) {
        return -22
    }
    if ((flags & 32) !== 0) {
        ptr = _memalign(PAGE_SIZE, len);
        if (!ptr)
            return -12;
        _memset(ptr, 0, len);
        allocated = true
    } else {
        var info = FS.getStream(fd);
        if (!info)
            return -9;
        var res = FS.mmap(info, HEAPU8, addr, len, off, prot, flags);
        ptr = res.ptr;
        allocated = res.allocated
    }
    SYSCALLS.mappings[ptr] = {
        malloc: ptr,
        len: len,
        allocated: allocated,
        fd: fd,
        flags: flags
    };
    return ptr
}
function ___syscall192(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var addr = SYSCALLS.get()
          , len = SYSCALLS.get()
          , prot = SYSCALLS.get()
          , flags = SYSCALLS.get()
          , fd = SYSCALLS.get()
          , off = SYSCALLS.get();
        return __emscripten_syscall_mmap2(addr, len, prot, flags, fd, off)
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError))
            abort(e);
        return -e.errno
    }
}
function ___syscall194(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var fd = SYSCALLS.get()
          , zero = SYSCALLS.getZero()
          , length = SYSCALLS.get64();
        FS.ftruncate(fd, length);
        return 0
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError))
            abort(e);
        return -e.errno
    }
}
function ___syscall195(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var path = SYSCALLS.getStr()
          , buf = SYSCALLS.get();
        return SYSCALLS.doStat(FS.stat, path, buf)
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError))
            abort(e);
        return -e.errno
    }
}
function ___syscall196(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var path = SYSCALLS.getStr()
          , buf = SYSCALLS.get();
        return SYSCALLS.doStat(FS.lstat, path, buf)
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError))
            abort(e);
        return -e.errno
    }
}
function ___syscall197(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var stream = SYSCALLS.getStreamFromFD()
          , buf = SYSCALLS.get();
        return SYSCALLS.doStat(FS.stat, stream.path, buf)
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError))
            abort(e);
        return -e.errno
    }
}
function ___syscall202(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        return 0
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError))
            abort(e);
        return -e.errno
    }
}
function ___syscall199(a0, a1) {
    return ___syscall202(a0, a1)
}
var PROCINFO = {
    ppid: 1,
    pid: 42,
    sid: 42,
    pgid: 42
};
function ___syscall20(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        return PROCINFO.pid
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError))
            abort(e);
        return -e.errno
    }
}
function ___syscall201(a0, a1) {
    return ___syscall202(a0, a1)
}
function ___syscall211(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var ruid = SYSCALLS.get()
          , euid = SYSCALLS.get()
          , suid = SYSCALLS.get();
        HEAP32[ruid >> 2] = 0;
        HEAP32[euid >> 2] = 0;
        HEAP32[suid >> 2] = 0;
        return 0
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError))
            abort(e);
        return -e.errno
    }
}
function ___syscall209(a0, a1) {
    return ___syscall211(a0, a1)
}
function ___syscall220(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var stream = SYSCALLS.getStreamFromFD()
          , dirp = SYSCALLS.get()
          , count = SYSCALLS.get();
        if (!stream.getdents) {
            stream.getdents = FS.readdir(stream.path)
        }
        var struct_size = 280;
        var pos = 0;
        var off = FS.llseek(stream, 0, 1);
        var idx = Math.floor(off / struct_size);
        while (idx < stream.getdents.length && pos + struct_size <= count) {
            var id;
            var type;
            var name = stream.getdents[idx];
            if (name[0] === ".") {
                id = 1;
                type = 4
            } else {
                var child = FS.lookupNode(stream.node, name);
                id = child.id;
                type = FS.isChrdev(child.mode) ? 2 : FS.isDir(child.mode) ? 4 : FS.isLink(child.mode) ? 10 : 8
            }
            tempI64 = [id >>> 0, (tempDouble = id,
            +Math_abs(tempDouble) >= 1 ? tempDouble > 0 ? (Math_min(+Math_floor(tempDouble / 4294967296), 4294967295) | 0) >>> 0 : ~~+Math_ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>> 0 : 0)],
            HEAP32[dirp + pos >> 2] = tempI64[0],
            HEAP32[dirp + pos + 4 >> 2] = tempI64[1];
            tempI64 = [(idx + 1) * struct_size >>> 0, (tempDouble = (idx + 1) * struct_size,
            +Math_abs(tempDouble) >= 1 ? tempDouble > 0 ? (Math_min(+Math_floor(tempDouble / 4294967296), 4294967295) | 0) >>> 0 : ~~+Math_ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>> 0 : 0)],
            HEAP32[dirp + pos + 8 >> 2] = tempI64[0],
            HEAP32[dirp + pos + 12 >> 2] = tempI64[1];
            HEAP16[dirp + pos + 16 >> 1] = 280;
            HEAP8[dirp + pos + 18 >> 0] = type;
            stringToUTF8(name, dirp + pos + 19, 256);
            pos += struct_size;
            idx += 1
        }
        FS.llseek(stream, idx * struct_size, 0);
        return pos
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError))
            abort(e);
        return -e.errno
    }
}
function ___syscall221(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var stream = SYSCALLS.getStreamFromFD()
          , cmd = SYSCALLS.get();
        switch (cmd) {
        case 0:
            {
                var arg = SYSCALLS.get();
                if (arg < 0) {
                    return -22
                }
                var newStream;
                newStream = FS.open(stream.path, stream.flags, 0, arg);
                return newStream.fd
            }
        case 1:
        case 2:
            return 0;
        case 3:
            return stream.flags;
        case 4:
            {
                var arg = SYSCALLS.get();
                stream.flags |= arg;
                return 0
            }
        case 12:
            {
                var arg = SYSCALLS.get();
                var offset = 0;
                HEAP16[arg + offset >> 1] = 2;
                return 0
            }
        case 13:
        case 14:
            return 0;
        case 16:
        case 8:
            return -22;
        case 9:
            ___setErrNo(22);
            return -1;
        default:
            {
                return -22
            }
        }
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError))
            abort(e);
        return -e.errno
    }
}
function ___syscall268(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var path = SYSCALLS.getStr()
          , size = SYSCALLS.get()
          , buf = SYSCALLS.get();
        HEAP32[buf + 4 >> 2] = 4096;
        HEAP32[buf + 40 >> 2] = 4096;
        HEAP32[buf + 8 >> 2] = 1e6;
        HEAP32[buf + 12 >> 2] = 5e5;
        HEAP32[buf + 16 >> 2] = 5e5;
        HEAP32[buf + 20 >> 2] = FS.nextInode;
        HEAP32[buf + 24 >> 2] = 1e6;
        HEAP32[buf + 28 >> 2] = 42;
        HEAP32[buf + 44 >> 2] = 2;
        HEAP32[buf + 36 >> 2] = 255;
        return 0
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError))
            abort(e);
        return -e.errno
    }
}
function ___syscall272(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        return 0
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError))
            abort(e);
        return -e.errno
    }
}
function ___syscall3(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var stream = SYSCALLS.getStreamFromFD()
          , buf = SYSCALLS.get()
          , count = SYSCALLS.get();
        return FS.read(stream, HEAP8, buf, count)
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError))
            abort(e);
        return -e.errno
    }
}
function ___syscall320(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var dirfd = SYSCALLS.get()
          , path = SYSCALLS.getStr()
          , times = SYSCALLS.get()
          , flags = SYSCALLS.get();
        path = SYSCALLS.calculateAt(dirfd, path);
        var seconds = HEAP32[times >> 2];
        var nanoseconds = HEAP32[times + 4 >> 2];
        var atime = seconds * 1e3 + nanoseconds / (1e3 * 1e3);
        times += 8;
        seconds = HEAP32[times >> 2];
        nanoseconds = HEAP32[times + 4 >> 2];
        var mtime = seconds * 1e3 + nanoseconds / (1e3 * 1e3);
        FS.utime(path, atime, mtime);
        return 0
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError))
            abort(e);
        return -e.errno
    }
}
function ___syscall33(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var path = SYSCALLS.getStr()
          , amode = SYSCALLS.get();
        return SYSCALLS.doAccess(path, amode)
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError))
            abort(e);
        return -e.errno
    }
}
function ___syscall38(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var old_path = SYSCALLS.getStr()
          , new_path = SYSCALLS.getStr();
        FS.rename(old_path, new_path);
        return 0
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError))
            abort(e);
        return -e.errno
    }
}
function ___syscall39(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var path = SYSCALLS.getStr()
          , mode = SYSCALLS.get();
        return SYSCALLS.doMkdir(path, mode)
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError))
            abort(e);
        return -e.errno
    }
}
function ___syscall4(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var stream = SYSCALLS.getStreamFromFD()
          , buf = SYSCALLS.get()
          , count = SYSCALLS.get();
        return FS.write(stream, HEAP8, buf, count)
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError))
            abort(e);
        return -e.errno
    }
}
function ___syscall40(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var path = SYSCALLS.getStr();
        FS.rmdir(path);
        return 0
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError))
            abort(e);
        return -e.errno
    }
}
function ___syscall41(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var old = SYSCALLS.getStreamFromFD();
        return FS.open(old.path, old.flags, 0).fd
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError))
            abort(e);
        return -e.errno
    }
}
var PIPEFS = {
    BUCKET_BUFFER_SIZE: 8192,
    mount: function(mount) {
        return FS.createNode(null, "/", 16384 | 511, 0)
    },
    createPipe: function() {
        var pipe = {
            buckets: []
        };
        pipe.buckets.push({
            buffer: new Uint8Array(PIPEFS.BUCKET_BUFFER_SIZE),
            offset: 0,
            roffset: 0
        });
        var rName = PIPEFS.nextname();
        var wName = PIPEFS.nextname();
        var rNode = FS.createNode(PIPEFS.root, rName, 4096, 0);
        var wNode = FS.createNode(PIPEFS.root, wName, 4096, 0);
        rNode.pipe = pipe;
        wNode.pipe = pipe;
        var readableStream = FS.createStream({
            path: rName,
            node: rNode,
            flags: FS.modeStringToFlags("r"),
            seekable: false,
            stream_ops: PIPEFS.stream_ops
        });
        rNode.stream = readableStream;
        var writableStream = FS.createStream({
            path: wName,
            node: wNode,
            flags: FS.modeStringToFlags("w"),
            seekable: false,
            stream_ops: PIPEFS.stream_ops
        });
        wNode.stream = writableStream;
        return {
            readable_fd: readableStream.fd,
            writable_fd: writableStream.fd
        }
    },
    stream_ops: {
        poll: function(stream) {
            var pipe = stream.node.pipe;
            if ((stream.flags & 2097155) === 1) {
                return 256 | 4
            } else {
                if (pipe.buckets.length > 0) {
                    for (var i = 0; i < pipe.buckets.length; i++) {
                        var bucket = pipe.buckets[i];
                        if (bucket.offset - bucket.roffset > 0) {
                            return 64 | 1
                        }
                    }
                }
            }
            return 0
        },
        ioctl: function(stream, request, varargs) {
            return ERRNO_CODES.EINVAL
        },
        fsync: function(stream) {
            return ERRNO_CODES.EINVAL
        },
        read: function(stream, buffer, offset, length, position) {
            var pipe = stream.node.pipe;
            var currentLength = 0;
            for (var i = 0; i < pipe.buckets.length; i++) {
                var bucket = pipe.buckets[i];
                currentLength += bucket.offset - bucket.roffset
            }
            assert(buffer instanceof ArrayBuffer || ArrayBuffer.isView(buffer));
            var data = buffer.subarray(offset, offset + length);
            if (length <= 0) {
                return 0
            }
            if (currentLength == 0) {
                throw new FS.ErrnoError(ERRNO_CODES.EAGAIN)
            }
            var toRead = Math.min(currentLength, length);
            var totalRead = toRead;
            var toRemove = 0;
            for (var i = 0; i < pipe.buckets.length; i++) {
                var currBucket = pipe.buckets[i];
                var bucketSize = currBucket.offset - currBucket.roffset;
                if (toRead <= bucketSize) {
                    var tmpSlice = currBucket.buffer.subarray(currBucket.roffset, currBucket.offset);
                    if (toRead < bucketSize) {
                        tmpSlice = tmpSlice.subarray(0, toRead);
                        currBucket.roffset += toRead
                    } else {
                        toRemove++
                    }
                    data.set(tmpSlice);
                    break
                } else {
                    var tmpSlice = currBucket.buffer.subarray(currBucket.roffset, currBucket.offset);
                    data.set(tmpSlice);
                    data = data.subarray(tmpSlice.byteLength);
                    toRead -= tmpSlice.byteLength;
                    toRemove++
                }
            }
            if (toRemove && toRemove == pipe.buckets.length) {
                toRemove--;
                pipe.buckets[toRemove].offset = 0;
                pipe.buckets[toRemove].roffset = 0
            }
            pipe.buckets.splice(0, toRemove);
            return totalRead
        },
        write: function(stream, buffer, offset, length, position) {
            var pipe = stream.node.pipe;
            assert(buffer instanceof ArrayBuffer || ArrayBuffer.isView(buffer));
            var data = buffer.subarray(offset, offset + length);
            var dataLen = data.byteLength;
            if (dataLen <= 0) {
                return 0
            }
            var currBucket = null;
            if (pipe.buckets.length == 0) {
                currBucket = {
                    buffer: new Uint8Array(PIPEFS.BUCKET_BUFFER_SIZE),
                    offset: 0,
                    roffset: 0
                };
                pipe.buckets.push(currBucket)
            } else {
                currBucket = pipe.buckets[pipe.buckets.length - 1]
            }
            assert(currBucket.offset <= PIPEFS.BUCKET_BUFFER_SIZE);
            var freeBytesInCurrBuffer = PIPEFS.BUCKET_BUFFER_SIZE - currBucket.offset;
            if (freeBytesInCurrBuffer >= dataLen) {
                currBucket.buffer.set(data, currBucket.offset);
                currBucket.offset += dataLen;
                return dataLen
            } else if (freeBytesInCurrBuffer > 0) {
                currBucket.buffer.set(data.subarray(0, freeBytesInCurrBuffer), currBucket.offset);
                currBucket.offset += freeBytesInCurrBuffer;
                data = data.subarray(freeBytesInCurrBuffer, data.byteLength)
            }
            var numBuckets = data.byteLength / PIPEFS.BUCKET_BUFFER_SIZE | 0;
            var remElements = data.byteLength % PIPEFS.BUCKET_BUFFER_SIZE;
            for (var i = 0; i < numBuckets; i++) {
                var newBucket = {
                    buffer: new Uint8Array(PIPEFS.BUCKET_BUFFER_SIZE),
                    offset: PIPEFS.BUCKET_BUFFER_SIZE,
                    roffset: 0
                };
                pipe.buckets.push(newBucket);
                newBucket.buffer.set(data.subarray(0, PIPEFS.BUCKET_BUFFER_SIZE));
                data = data.subarray(PIPEFS.BUCKET_BUFFER_SIZE, data.byteLength)
            }
            if (remElements > 0) {
                var newBucket = {
                    buffer: new Uint8Array(PIPEFS.BUCKET_BUFFER_SIZE),
                    offset: data.byteLength,
                    roffset: 0
                };
                pipe.buckets.push(newBucket);
                newBucket.buffer.set(data)
            }
            return dataLen
        },
        close: function(stream) {
            var pipe = stream.node.pipe;
            pipe.buckets = null
        }
    },
    nextname: function() {
        if (!PIPEFS.nextname.current) {
            PIPEFS.nextname.current = 0
        }
        return "pipe[" + PIPEFS.nextname.current++ + "]"
    }
};
function ___syscall42(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var fdPtr = SYSCALLS.get();
        if (fdPtr == 0) {
            throw new FS.ErrnoError(14)
        }
        var res = PIPEFS.createPipe();
        HEAP32[fdPtr >> 2] = res.readable_fd;
        HEAP32[fdPtr + 4 >> 2] = res.writable_fd;
        return 0
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError))
            abort(e);
        return -e.errno
    }
}
function ___syscall5(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var pathname = SYSCALLS.getStr()
          , flags = SYSCALLS.get()
          , mode = SYSCALLS.get();
        var stream = FS.open(pathname, flags, mode);
        return stream.fd
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError))
            abort(e);
        return -e.errno
    }
}
function ___syscall54(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var stream = SYSCALLS.getStreamFromFD()
          , op = SYSCALLS.get();
        switch (op) {
        case 21509:
        case 21505:
            {
                if (!stream.tty)
                    return -25;
                return 0
            }
        case 21510:
        case 21511:
        case 21512:
        case 21506:
        case 21507:
        case 21508:
            {
                if (!stream.tty)
                    return -25;
                return 0
            }
        case 21519:
            {
                if (!stream.tty)
                    return -25;
                var argp = SYSCALLS.get();
                HEAP32[argp >> 2] = 0;
                return 0
            }
        case 21520:
            {
                if (!stream.tty)
                    return -25;
                return -22
            }
        case 21531:
            {
                var argp = SYSCALLS.get();
                return FS.ioctl(stream, op, argp)
            }
        case 21523:
            {
                if (!stream.tty)
                    return -25;
                return 0
            }
        case 21524:
            {
                if (!stream.tty)
                    return -25;
                return 0
            }
        default:
            abort("bad ioctl syscall " + op)
        }
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError))
            abort(e);
        return -e.errno
    }
}
function ___syscall6(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var stream = SYSCALLS.getStreamFromFD();
        FS.close(stream);
        return 0
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError))
            abort(e);
        return -e.errno
    }
}
function ___syscall63(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var old = SYSCALLS.getStreamFromFD()
          , suggestFD = SYSCALLS.get();
        if (old.fd === suggestFD)
            return suggestFD;
        return SYSCALLS.doDup(old.path, old.flags, suggestFD)
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError))
            abort(e);
        return -e.errno
    }
}
function ___syscall77(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var who = SYSCALLS.get()
          , usage = SYSCALLS.get();
        _memset(usage, 0, 136);
        HEAP32[usage >> 2] = 1;
        HEAP32[usage + 4 >> 2] = 2;
        HEAP32[usage + 8 >> 2] = 3;
        HEAP32[usage + 12 >> 2] = 4;
        return 0
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError))
            abort(e);
        return -e.errno
    }
}
function ___syscall85(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var path = SYSCALLS.getStr()
          , buf = SYSCALLS.get()
          , bufsize = SYSCALLS.get();
        return SYSCALLS.doReadlink(path, buf, bufsize)
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError))
            abort(e);
        return -e.errno
    }
}
function ___syscall9(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var oldpath = SYSCALLS.get()
          , newpath = SYSCALLS.get();
        return -31
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError))
            abort(e);
        return -e.errno
    }
}
function __emscripten_syscall_munmap(addr, len) {
    if (addr == -1 || len == 0) {
        return -22
    }
    var info = SYSCALLS.mappings[addr];
    if (!info)
        return 0;
    if (len === info.len) {
        var stream = FS.getStream(info.fd);
        SYSCALLS.doMsync(addr, stream, len, info.flags);
        FS.munmap(stream);
        SYSCALLS.mappings[addr] = null;
        if (info.allocated) {
            _free(info.malloc)
        }
    }
    return 0
}
function ___syscall91(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var addr = SYSCALLS.get()
          , len = SYSCALLS.get();
        return __emscripten_syscall_munmap(addr, len)
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError))
            abort(e);
        return -e.errno
    }
}
function ___syscall94(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var fd = SYSCALLS.get()
          , mode = SYSCALLS.get();
        FS.fchmod(fd, mode);
        return 0
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError))
            abort(e);
        return -e.errno
    }
}
function ___syscall96(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        return 0
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError))
            abort(e);
        return -e.errno
    }
}
function ___syscall97(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        return -1
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError))
            abort(e);
        return -e.errno
    }
}
function ___unlock() {}
function _exit(status) {
    exit(status)
}
function _abort() {
    Module["abort"]()
}
function _emscripten_get_now_res() {
    if (ENVIRONMENT_IS_NODE) {
        return 1
    } else if (typeof dateNow !== "undefined") {
        return 1e3
    } else if (typeof performance === "object" && performance && typeof performance["now"] === "function") {
        return 1e3
    } else {
        return 1e3 * 1e3
    }
}
function _clock_getres(clk_id, res) {
    var nsec;
    if (clk_id === 0) {
        nsec = 1e3 * 1e3
    } else if (clk_id === 1 && _emscripten_get_now_is_monotonic()) {
        nsec = _emscripten_get_now_res()
    } else {
        ___setErrNo(22);
        return -1
    }
    HEAP32[res >> 2] = nsec / 1e9 | 0;
    HEAP32[res + 4 >> 2] = nsec;
    return 0
}
function _emscripten_get_heap_size() {
    return HEAP8.length
}
function _emscripten_memcpy_big(dest, src, num) {
    HEAPU8.set(HEAPU8.subarray(src, src + num), dest)
}
var _fabs = Math_abs;
var _fabsf = Math_abs;
var _floor = Math_floor;
function _fork() {
    ___setErrNo(11);
    return -1
}
function _getTempRet0() {
    return getTempRet0() | 0
}
function _getaddrinfo(node, service, hint, out) {
    var addr = 0;
    var port = 0;
    var flags = 0;
    var family = 0;
    var type = 0;
    var proto = 0;
    var ai;
    function allocaddrinfo(family, type, proto, canon, addr, port) {
        var sa, salen, ai;
        var res;
        salen = family === 10 ? 28 : 16;
        addr = family === 10 ? __inet_ntop6_raw(addr) : __inet_ntop4_raw(addr);
        sa = _malloc(salen);
        res = __write_sockaddr(sa, family, addr, port);
        assert(!res.errno);
        ai = _malloc(32);
        HEAP32[ai + 4 >> 2] = family;
        HEAP32[ai + 8 >> 2] = type;
        HEAP32[ai + 12 >> 2] = proto;
        HEAP32[ai + 24 >> 2] = canon;
        HEAP32[ai + 20 >> 2] = sa;
        if (family === 10) {
            HEAP32[ai + 16 >> 2] = 28
        } else {
            HEAP32[ai + 16 >> 2] = 16
        }
        HEAP32[ai + 28 >> 2] = 0;
        return ai
    }
    if (hint) {
        flags = HEAP32[hint >> 2];
        family = HEAP32[hint + 4 >> 2];
        type = HEAP32[hint + 8 >> 2];
        proto = HEAP32[hint + 12 >> 2]
    }
    if (type && !proto) {
        proto = type === 2 ? 17 : 6
    }
    if (!type && proto) {
        type = proto === 17 ? 2 : 1
    }
    if (proto === 0) {
        proto = 6
    }
    if (type === 0) {
        type = 1
    }
    if (!node && !service) {
        return -2
    }
    if (flags & ~(1 | 2 | 4 | 1024 | 8 | 16 | 32)) {
        return -1
    }
    if (hint !== 0 && HEAP32[hint >> 2] & 2 && !node) {
        return -1
    }
    if (flags & 32) {
        return -2
    }
    if (type !== 0 && type !== 1 && type !== 2) {
        return -7
    }
    if (family !== 0 && family !== 2 && family !== 10) {
        return -6
    }
    if (service) {
        service = UTF8ToString(service);
        port = parseInt(service, 10);
        if (isNaN(port)) {
            if (flags & 1024) {
                return -2
            }
            return -8
        }
    }
    if (!node) {
        if (family === 0) {
            family = 2
        }
        if ((flags & 1) === 0) {
            if (family === 2) {
                addr = _htonl(2130706433)
            } else {
                addr = [0, 0, 0, 1]
            }
        }
        ai = allocaddrinfo(family, type, proto, null, addr, port);
        HEAP32[out >> 2] = ai;
        return 0
    }
    node = UTF8ToString(node);
    addr = __inet_pton4_raw(node);
    if (addr !== null) {
        if (family === 0 || family === 2) {
            family = 2
        } else if (family === 10 && flags & 8) {
            addr = [0, 0, _htonl(65535), addr];
            family = 10
        } else {
            return -2
        }
    } else {
        addr = __inet_pton6_raw(node);
        if (addr !== null) {
            if (family === 0 || family === 10) {
                family = 10
            } else {
                return -2
            }
        }
    }
    if (addr != null) {
        ai = allocaddrinfo(family, type, proto, node, addr, port);
        HEAP32[out >> 2] = ai;
        return 0
    }
    if (flags & 4) {
        return -2
    }
    node = DNS.lookup_name(node);
    addr = __inet_pton4_raw(node);
    if (family === 0) {
        family = 2
    } else if (family === 10) {
        addr = [0, 0, _htonl(65535), addr]
    }
    ai = allocaddrinfo(family, type, proto, null, addr, port);
    HEAP32[out >> 2] = ai;
    return 0
}
function _getenv(name) {
    if (name === 0)
        return 0;
    name = UTF8ToString(name);
    if (!ENV.hasOwnProperty(name))
        return 0;
    if (_getenv.ret)
        _free(_getenv.ret);
    _getenv.ret = allocateUTF8(ENV[name]);
    return _getenv.ret
}
function _getnameinfo(sa, salen, node, nodelen, serv, servlen, flags) {
    var info = __read_sockaddr(sa, salen);
    if (info.errno) {
        return -6
    }
    var port = info.port;
    var addr = info.addr;
    var overflowed = false;
    if (node && nodelen) {
        var lookup;
        if (flags & 1 || !(lookup = DNS.lookup_addr(addr))) {
            if (flags & 8) {
                return -2
            }
        } else {
            addr = lookup
        }
        var numBytesWrittenExclNull = stringToUTF8(addr, node, nodelen);
        if (numBytesWrittenExclNull + 1 >= nodelen) {
            overflowed = true
        }
    }
    if (serv && servlen) {
        port = "" + port;
        var numBytesWrittenExclNull = stringToUTF8(port, serv, servlen);
        if (numBytesWrittenExclNull + 1 >= servlen) {
            overflowed = true
        }
    }
    if (overflowed) {
        return -12
    }
    return 0
}
var Protocols = {
    list: [],
    map: {}
};
function _setprotoent(stayopen) {
    function allocprotoent(name, proto, aliases) {
        var nameBuf = _malloc(name.length + 1);
        writeAsciiToMemory(name, nameBuf);
        var j = 0;
        var length = aliases.length;
        var aliasListBuf = _malloc((length + 1) * 4);
        for (var i = 0; i < length; i++,
        j += 4) {
            var alias = aliases[i];
            var aliasBuf = _malloc(alias.length + 1);
            writeAsciiToMemory(alias, aliasBuf);
            HEAP32[aliasListBuf + j >> 2] = aliasBuf
        }
        HEAP32[aliasListBuf + j >> 2] = 0;
        var pe = _malloc(12);
        HEAP32[pe >> 2] = nameBuf;
        HEAP32[pe + 4 >> 2] = aliasListBuf;
        HEAP32[pe + 8 >> 2] = proto;
        return pe
    }
    var list = Protocols.list;
    var map = Protocols.map;
    if (list.length === 0) {
        var entry = allocprotoent("tcp", 6, ["TCP"]);
        list.push(entry);
        map["tcp"] = map["6"] = entry;
        entry = allocprotoent("udp", 17, ["UDP"]);
        list.push(entry);
        map["udp"] = map["17"] = entry
    }
    _setprotoent.index = 0
}
function _getprotobyname(name) {
    name = UTF8ToString(name);
    _setprotoent(true);
    var result = Protocols.map[name];
    return result
}
function _getpwuid(uid) {
    return 0
}
function _gettimeofday(ptr) {
    var now = Date.now();
    HEAP32[ptr >> 2] = now / 1e3 | 0;
    HEAP32[ptr + 4 >> 2] = now % 1e3 * 1e3 | 0;
    return 0
}
var ___tm_timezone = (stringToUTF8("GMT", 737328, 4),
737328);
function _gmtime_r(time, tmPtr) {
    var date = new Date(HEAP32[time >> 2] * 1e3);
    HEAP32[tmPtr >> 2] = date.getUTCSeconds();
    HEAP32[tmPtr + 4 >> 2] = date.getUTCMinutes();
    HEAP32[tmPtr + 8 >> 2] = date.getUTCHours();
    HEAP32[tmPtr + 12 >> 2] = date.getUTCDate();
    HEAP32[tmPtr + 16 >> 2] = date.getUTCMonth();
    HEAP32[tmPtr + 20 >> 2] = date.getUTCFullYear() - 1900;
    HEAP32[tmPtr + 24 >> 2] = date.getUTCDay();
    HEAP32[tmPtr + 36 >> 2] = 0;
    HEAP32[tmPtr + 32 >> 2] = 0;
    var start = Date.UTC(date.getUTCFullYear(), 0, 1, 0, 0, 0, 0);
    var yday = (date.getTime() - start) / (1e3 * 60 * 60 * 24) | 0;
    HEAP32[tmPtr + 28 >> 2] = yday;
    HEAP32[tmPtr + 40 >> 2] = ___tm_timezone;
    return tmPtr
}
function _kill(pid, sig) {
    ___setErrNo(ERRNO_CODES.EPERM);
    return -1
}
function _llvm_eh_typeid_for(type) {
    return type
}
function _tzset() {
    if (_tzset.called)
        return;
    _tzset.called = true;
    HEAP32[__get_timezone() >> 2] = (new Date).getTimezoneOffset() * 60;
    var winter = new Date(2e3,0,1);
    var summer = new Date(2e3,6,1);
    HEAP32[__get_daylight() >> 2] = Number(winter.getTimezoneOffset() != summer.getTimezoneOffset());
    function extractZone(date) {
        var match = date.toTimeString().match(/\(([A-Za-z ]+)\)$/);
        return match ? match[1] : "GMT"
    }
    var winterName = extractZone(winter);
    var summerName = extractZone(summer);
    var winterNamePtr = allocate(intArrayFromString(winterName), "i8", ALLOC_NORMAL);
    var summerNamePtr = allocate(intArrayFromString(summerName), "i8", ALLOC_NORMAL);
    if (summer.getTimezoneOffset() < winter.getTimezoneOffset()) {
        HEAP32[__get_tzname() >> 2] = winterNamePtr;
        HEAP32[__get_tzname() + 4 >> 2] = summerNamePtr
    } else {
        HEAP32[__get_tzname() >> 2] = summerNamePtr;
        HEAP32[__get_tzname() + 4 >> 2] = winterNamePtr
    }
}
function _localtime_r(time, tmPtr) {
    _tzset();
    var date = new Date(HEAP32[time >> 2] * 1e3);
    HEAP32[tmPtr >> 2] = date.getSeconds();
    HEAP32[tmPtr + 4 >> 2] = date.getMinutes();
    HEAP32[tmPtr + 8 >> 2] = date.getHours();
    HEAP32[tmPtr + 12 >> 2] = date.getDate();
    HEAP32[tmPtr + 16 >> 2] = date.getMonth();
    HEAP32[tmPtr + 20 >> 2] = date.getFullYear() - 1900;
    HEAP32[tmPtr + 24 >> 2] = date.getDay();
    var start = new Date(date.getFullYear(),0,1);
    var yday = (date.getTime() - start.getTime()) / (1e3 * 60 * 60 * 24) | 0;
    HEAP32[tmPtr + 28 >> 2] = yday;
    HEAP32[tmPtr + 36 >> 2] = -(date.getTimezoneOffset() * 60);
    var summerOffset = new Date(2e3,6,1).getTimezoneOffset();
    var winterOffset = start.getTimezoneOffset();
    var dst = (summerOffset != winterOffset && date.getTimezoneOffset() == Math.min(winterOffset, summerOffset)) | 0;
    HEAP32[tmPtr + 32 >> 2] = dst;
    var zonePtr = HEAP32[__get_tzname() + (dst ? 4 : 0) >> 2];
    HEAP32[tmPtr + 40 >> 2] = zonePtr;
    return tmPtr
}
var MONO = {
    pump_count: 0,
    timeout_queue: [],
    mono_wasm_runtime_is_ready: false,
    pump_message: function() {
        if (!this.mono_background_exec)
            this.mono_background_exec = Module.cwrap("mono_background_exec", "void", []);
        while (MONO.timeout_queue.length > 0) {
            --MONO.pump_count;
            MONO.timeout_queue.shift()()
        }
        while (MONO.pump_count > 0) {
            --MONO.pump_count;
            this.mono_background_exec()
        }
    },
    mono_wasm_get_call_stack: function() {
        if (!this.mono_wasm_current_bp_id)
            this.mono_wasm_current_bp_id = Module.cwrap("mono_wasm_current_bp_id", "number", []);
        if (!this.mono_wasm_enum_frames)
            this.mono_wasm_enum_frames = Module.cwrap("mono_wasm_enum_frames", "void", []);
        var bp_id = this.mono_wasm_current_bp_id();
        this.active_frames = [];
        this.mono_wasm_enum_frames();
        var the_frames = this.active_frames;
        this.active_frames = [];
        return {
            "breakpoint_id": bp_id,
            "frames": the_frames
        }
    },
    mono_wasm_get_variables: function(scope, var_list) {
        if (!this.mono_wasm_get_var_info)
            this.mono_wasm_get_var_info = Module.cwrap("mono_wasm_get_var_info", "void", ["number", "number", "number"]);
        this.var_info = [];
        var numBytes = var_list.length * Int32Array.BYTES_PER_ELEMENT;
        var ptr = Module._malloc(numBytes);
        var heapBytes = new Int32Array(Module.HEAP32.buffer,ptr,numBytes);
        for (let i = 0; i < var_list.length; i++) {
            heapBytes[i] = var_list[i]
        }
        this.mono_wasm_get_var_info(scope, heapBytes.byteOffset, var_list.length);
        Module._free(heapBytes.byteOffset);
        var res = this.var_info;
        this.var_info = [];
        return res
    },
    mono_wasm_get_object_properties: function(objId) {
        if (!this.mono_wasm_get_object_properties_info)
            this.mono_wasm_get_object_properties_info = Module.cwrap("mono_wasm_get_object_properties", "void", ["number"]);
        this.var_info = [];
        console.log(">> mono_wasm_get_object_properties " + objId);
        this.mono_wasm_get_object_properties_info(objId);
        var res = this.var_info;
        this.var_info = [];
        return res
    },
    mono_wasm_get_array_values: function(objId) {
        if (!this.mono_wasm_get_array_values_info)
            this.mono_wasm_get_array_values_info = Module.cwrap("mono_wasm_get_array_values", "void", ["number"]);
        this.var_info = [];
        console.log(">> mono_wasm_get_array_values " + objId);
        this.mono_wasm_get_array_values_info(objId);
        var res = this.var_info;
        this.var_info = [];
        return res
    },
    mono_wasm_start_single_stepping: function(kind) {
        console.log(">> mono_wasm_start_single_stepping " + kind);
        if (!this.mono_wasm_setup_single_step)
            this.mono_wasm_setup_single_step = Module.cwrap("mono_wasm_setup_single_step", "void", ["number"]);
        this.mono_wasm_setup_single_step(kind)
    },
    mono_wasm_runtime_ready: function() {
        console.log(">>mono_wasm_runtime_ready");
        this.mono_wasm_runtime_is_ready = true;
        debugger
    },
    mono_wasm_set_breakpoint: function(assembly, method_token, il_offset) {
        if (!this.mono_wasm_set_bp)
            this.mono_wasm_set_bp = Module.cwrap("mono_wasm_set_breakpoint", "number", ["string", "number", "number"]);
        return this.mono_wasm_set_bp(assembly, method_token, il_offset)
    },
    mono_wasm_remove_breakpoint: function(breakpoint_id) {
        if (!this.mono_wasm_del_bp)
            this.mono_wasm_del_bp = Module.cwrap("mono_wasm_remove_breakpoint", "number", ["number"]);
        return this.mono_wasm_del_bp(breakpoint_id)
    },
    mono_wasm_setenv: function(name, value) {
        if (!this.wasm_setenv)
            this.wasm_setenv = Module.cwrap("mono_wasm_setenv", "void", ["string", "string"]);
        this.wasm_setenv(name, value)
    },
    mono_wasm_set_runtime_options: function(options) {
        if (!this.wasm_parse_runtime_options)
            this.wasm_parse_runtime_options = Module.cwrap("mono_wasm_parse_runtime_options", "void", ["number", "number"]);
        var argv = Module._malloc(options.length * 4);
        var wasm_strdup = Module.cwrap("mono_wasm_strdup", "number", ["string"]);
        aindex = 0;
        for (var i = 0; i < options.length; ++i) {
            Module.setValue(argv + aindex * 4, wasm_strdup(options[i]), "i32");
            aindex += 1
        }
        this.wasm_parse_runtime_options(options.length, argv)
    },
    mono_wasm_init_aot_profiler: function(options) {
        if (options == null)
            options = {};
        if (!("write_at"in options))
            options.write_at = "WebAssembly.Runtime::StopProfile";
        if (!("send_to"in options))
            options.send_to = "WebAssembly.Runtime::DumpAotProfileData";
        var arg = "aot:write-at-method=" + options.write_at + ",send-to-method=" + options.send_to;
        Module.ccall("mono_wasm_load_profiler_aot", "void", ["string"], [arg])
    },
    mono_load_runtime_and_bcl: function(vfs_prefix, deploy_prefix, enable_debugging, file_list, loaded_cb, fetch_file_cb) {
        var pending = file_list.length;
        var loaded_files = [];
        var mono_wasm_add_assembly = Module.cwrap("mono_wasm_add_assembly", null, ["string", "number", "number"]);
        if (!fetch_file_cb) {
            if (ENVIRONMENT_IS_NODE) {
                var fs = require("fs");
                fetch_file_cb = function(asset) {
                    console.log("Loading... " + asset);
                    var binary = fs.readFileSync(asset);
                    var resolve_func2 = function(resolve, reject) {
                        resolve(new Uint8Array(binary))
                    };
                    var resolve_func1 = function(resolve, reject) {
                        var response = {
                            ok: true,
                            url: asset,
                            arrayBuffer: function() {
                                return new Promise(resolve_func2);
                            }
                        };
                        resolve(response)
                    };
                    return new Promise(resolve_func1)
                }
            } else {
                fetch_file_cb = function(asset) {
                    return fetch(asset, {
                        credentials: "same-origin"
                    })
                }
            }
        }
        file_list.forEach(function(file_name) {
            var fetch_promise = fetch_file_cb(locateFile(deploy_prefix + "/" + file_name));
            fetch_promise.then(function(response) {
                if (!response.ok)
                    throw "failed to load '" + file_name + "'";
                loaded_files.push(response.url);
                return response["arrayBuffer"]()
            }).then(function(blob) {
                var asm = new Uint8Array(blob);
                var memory = Module._malloc(asm.length);
                var heapBytes = new Uint8Array(Module.HEAPU8.buffer,memory,asm.length);
                heapBytes.set(asm);
                mono_wasm_add_assembly(file_name, memory, asm.length);
                console.log("Loaded: " + file_name);
                --pending;
                if (pending == 0) {
                    MONO.loaded_files = loaded_files;
                    var load_runtime = Module.cwrap("mono_wasm_load_runtime", null, ["string", "number"]);
                    console.log("initializing mono runtime");
                    if (ENVIRONMENT_IS_SHELL) {
                        try {
                            load_runtime(vfs_prefix, enable_debugging)
                        } catch (ex) {
                            print("load_runtime () failed: " + ex);
                            var err = new Error;
                            print("Stacktrace: \n");
                            print(err.stack);
                            var wasm_exit = Module.cwrap("mono_wasm_exit", "void", ["number"]);
                            wasm_exit(1)
                        }
                    } else {
                        load_runtime(vfs_prefix, enable_debugging)
                    }
                    MONO.mono_wasm_runtime_ready();
                    loaded_cb()
                }
            })
        })
    },
    mono_wasm_get_loaded_files: function() {
        console.log(">>>mono_wasm_get_loaded_files");
        return this.loaded_files
    },
    mono_wasm_clear_all_breakpoints: function() {
        if (this.mono_clear_bps)
            this.mono_clear_bps = Module.cwrap("mono_wasm_clear_all_breakpoints", "void", []);
        this.mono_clear_bps()
    }
};
function _mono_set_timeout(timeout, id) {
    if (!this.mono_set_timeout_exec)
        this.mono_set_timeout_exec = Module.cwrap("mono_set_timeout_exec", "void", ["number"]);
    if (ENVIRONMENT_IS_WEB) {
        window.setTimeout(function() {
            this.mono_set_timeout_exec(id)
        }, timeout)
    } else {
        ++MONO.pump_count;
        MONO.timeout_queue.push(function() {
            this.mono_set_timeout_exec(id)
        })
    }
}
function _mono_wasm_add_array_item(position) {
    MONO.var_info.push({
        name: "[" + position + "]"
    })
}
function _mono_wasm_add_array_var(className, objectId) {
    if (objectId == 0) {
        MONO.var_info.push({
            value: {
                type: "array",
                className: Module.UTF8ToString(className),
                description: Module.UTF8ToString(className),
                subtype: "null"
            }
        })
    } else {
        MONO.var_info.push({
            value: {
                type: "array",
                className: Module.UTF8ToString(className),
                description: Module.UTF8ToString(className),
                objectId: "dotnet:array:" + objectId
            }
        })
    }
}
function _mono_wasm_add_bool_var(var_value) {
    MONO.var_info.push({
        value: {
            type: "boolean",
            value: var_value != 0
        }
    })
}
function _mono_wasm_add_frame(il, method, name) {
    MONO.active_frames.push({
        il_pos: il,
        method_token: method,
        assembly_name: Module.UTF8ToString(name)
    })
}
function _mono_wasm_add_number_var(var_value) {
    MONO.var_info.push({
        value: {
            type: "number",
            value: var_value
        }
    })
}
function _mono_wasm_add_obj_var(className, objectId) {
    if (objectId == 0) {
        MONO.var_info.push({
            value: {
                type: "object",
                className: Module.UTF8ToString(className),
                description: Module.UTF8ToString(className),
                subtype: "null"
            }
        })
    } else {
        MONO.var_info.push({
            value: {
                type: "object",
                className: Module.UTF8ToString(className),
                description: Module.UTF8ToString(className),
                objectId: "dotnet:object:" + objectId
            }
        })
    }
}
function _mono_wasm_add_properties_var(name) {
    MONO.var_info.push({
        name: Module.UTF8ToString(name)
    })
}
function _mono_wasm_add_string_var(var_value) {
    if (var_value == 0) {
        MONO.var_info.push({
            value: {
                type: "object",
                subtype: "null"
            }
        })
    } else {
        MONO.var_info.push({
            value: {
                type: "string",
                value: Module.UTF8ToString(var_value)
            }
        })
    }
}
var BINDING = {
    BINDING_ASM: "[WebAssembly.Bindings]WebAssembly.Runtime",
    mono_wasm_object_registry: [],
    mono_wasm_ref_counter: 0,
    mono_wasm_free_list: [],
    mono_wasm_marshal_enum_as_int: false,
    mono_bindings_init: function(binding_asm) {
        this.BINDING_ASM = binding_asm
    },
    export_functions: function(module) {
        module["mono_bindings_init"] = BINDING.mono_bindings_init.bind(BINDING);
        module["mono_method_invoke"] = BINDING.call_method.bind(BINDING);
        module["mono_method_get_call_signature"] = BINDING.mono_method_get_call_signature.bind(BINDING);
        module["mono_method_resolve"] = BINDING.resolve_method_fqn.bind(BINDING);
        module["mono_bind_static_method"] = BINDING.bind_static_method.bind(BINDING);
        module["mono_call_static_method"] = BINDING.call_static_method.bind(BINDING)
    },
    bindings_lazy_init: function() {
        if (this.init)
            return;
        this.assembly_load = Module.cwrap("mono_wasm_assembly_load", "number", ["string"]);
        this.find_class = Module.cwrap("mono_wasm_assembly_find_class", "number", ["number", "string", "string"]);
        this.find_method = Module.cwrap("mono_wasm_assembly_find_method", "number", ["number", "string", "number"]);
        this.invoke_method = Module.cwrap("mono_wasm_invoke_method", "number", ["number", "number", "number", "number"]);
        this.mono_string_get_utf8 = Module.cwrap("mono_wasm_string_get_utf8", "number", ["number"]);
        this.js_string_to_mono_string = Module.cwrap("mono_wasm_string_from_js", "number", ["string"]);
        this.mono_get_obj_type = Module.cwrap("mono_wasm_get_obj_type", "number", ["number"]);
        this.mono_unbox_int = Module.cwrap("mono_unbox_int", "number", ["number"]);
        this.mono_unbox_float = Module.cwrap("mono_wasm_unbox_float", "number", ["number"]);
        this.mono_array_length = Module.cwrap("mono_wasm_array_length", "number", ["number"]);
        this.mono_array_get = Module.cwrap("mono_wasm_array_get", "number", ["number", "number"]);
        this.mono_obj_array_new = Module.cwrap("mono_wasm_obj_array_new", "number", ["number"]);
        this.mono_obj_array_set = Module.cwrap("mono_wasm_obj_array_set", "void", ["number", "number", "number"]);
        this.mono_unbox_enum = Module.cwrap("mono_wasm_unbox_enum", "number", ["number"]);
        this.mono_typed_array_new = Module.cwrap("mono_wasm_typed_array_new", "number", ["number", "number", "number", "number"]);
        var binding_fqn_asm = this.BINDING_ASM.substring(this.BINDING_ASM.indexOf("[") + 1, this.BINDING_ASM.indexOf("]")).trim();
        var binding_fqn_class = this.BINDING_ASM.substring(this.BINDING_ASM.indexOf("]") + 1).trim();
        this.binding_module = this.assembly_load(binding_fqn_asm);
        if (!this.binding_module)
            throw "Can't find bindings module assembly: " + binding_fqn_asm;
        if (binding_fqn_class !== null && typeof binding_fqn_class !== "undefined") {
            var namespace = "WebAssembly";
            var classname = binding_fqn_class.length > 0 ? binding_fqn_class : "Runtime";
            if (binding_fqn_class.indexOf(".") != -1) {
                var idx = binding_fqn_class.lastIndexOf(".");
                namespace = binding_fqn_class.substring(0, idx);
                classname = binding_fqn_class.substring(idx + 1)
            }
        }
        var wasm_runtime_class = this.find_class(this.binding_module, namespace, classname);
        if (!wasm_runtime_class)
            throw "Can't find " + binding_fqn_class + " class";
        var get_method = function(method_name) {
            var res = BINDING.find_method(wasm_runtime_class, method_name, -1);
            if (!res)
                throw "Can't find method " + namespace + "." + classname + ":" + method_name;
            return res
        };
        this.bind_js_obj = get_method("BindJSObject");
        this.bind_core_clr_obj = get_method("BindCoreCLRObject");
        this.bind_existing_obj = get_method("BindExistingObject");
        this.unbind_js_obj = get_method("UnBindJSObject");
        this.unbind_js_obj_and_free = get_method("UnBindJSObjectAndFree");
        this.unbind_raw_obj_and_free = get_method("UnBindRawJSObjectAndFree");
        this.get_js_id = get_method("GetJSObjectId");
        this.get_raw_mono_obj = get_method("GetMonoObject");
        this.box_js_int = get_method("BoxInt");
        this.box_js_double = get_method("BoxDouble");
        this.box_js_bool = get_method("BoxBool");
        this.is_simple_array = get_method("IsSimpleArray");
        this.get_core_type = get_method("GetCoreType");
        this.setup_js_cont = get_method("SetupJSContinuation");
        this.create_tcs = get_method("CreateTaskSource");
        this.set_tcs_result = get_method("SetTaskSourceResult");
        this.set_tcs_failure = get_method("SetTaskSourceFailure");
        this.tcs_get_task_and_bind = get_method("GetTaskAndBind");
        this.get_call_sig = get_method("GetCallSignature");
        this.object_to_string = get_method("ObjectToString");
        this.get_date_value = get_method("GetDateValue");
        this.create_date_time = get_method("CreateDateTime");
        this.object_to_enum = get_method("ObjectToEnum");
        this.init = true
    },
    get_js_obj: function(js_handle) {
        if (js_handle > 0)
            return this.mono_wasm_require_handle(js_handle);
        return null
    },
    conv_string: function(mono_obj) {
        if (mono_obj == 0)
            return null;
        var raw = this.mono_string_get_utf8(mono_obj);
        var res = Module.UTF8ToString(raw);
        Module._free(raw);
        return res
    },
    is_nested_array: function(ele) {
        return this.call_method(this.is_simple_array, null, "mi", [ele])
    },
    mono_array_to_js_array: function(mono_array) {
        if (mono_array == 0)
            return null;
        var res = [];
        var len = this.mono_array_length(mono_array);
        for (var i = 0; i < len; ++i) {
            var ele = this.mono_array_get(mono_array, i);
            if (this.is_nested_array(ele))
                res.push(this.mono_array_to_js_array(ele));
            else
                res.push(this.unbox_mono_obj(ele))
        }
        return res
    },
    js_array_to_mono_array: function(js_array) {
        var mono_array = this.mono_obj_array_new(js_array.length);
        for (var i = 0; i < js_array.length; ++i) {
            this.mono_obj_array_set(mono_array, i, this.js_to_mono_obj(js_array[i]))
        }
        return mono_array
    },
    unbox_mono_obj: function(mono_obj) {
        if (mono_obj == 0)
            return undefined;
        var type = this.mono_get_obj_type(mono_obj);
        switch (type) {
        case 1:
            return this.mono_unbox_int(mono_obj);
        case 2:
            return this.mono_unbox_float(mono_obj);
        case 3:
            return this.conv_string(mono_obj);
        case 4:
            throw new Error("no idea on how to unbox value types");
        case 5:
            {
                var obj = this.extract_js_obj(mono_obj);
                return function() {
                    return BINDING.invoke_delegate(obj, arguments)
                }
            }
        case 6:
            {
                if (typeof Promise === "undefined" || typeof Promise.resolve === "undefined")
                    throw new Error("Promises are not supported thus C# Tasks can not work in this context.");
                var obj = this.extract_js_obj(mono_obj);
                var cont_obj = null;
                var promise = new Promise(function(resolve, reject) {
                    cont_obj = {
                        resolve: resolve,
                        reject: reject
                    }
                }
                );
                this.call_method(this.setup_js_cont, null, "mo", [mono_obj, cont_obj]);
                obj.__mono_js_cont__ = cont_obj.__mono_gchandle__;
                cont_obj.__mono_js_task__ = obj.__mono_gchandle__;
                return promise
            }
        case 7:
            return this.extract_js_obj(mono_obj);
        case 8:
            return this.mono_unbox_int(mono_obj) != 0;
        case 9:
            if (this.mono_wasm_marshal_enum_as_int) {
                return this.mono_unbox_enum(mono_obj)
            } else {
                enumValue = this.call_method(this.object_to_string, null, "m", [mono_obj])
            }
            return enumValue;
        case 11:
        case 12:
        case 13:
        case 14:
        case 15:
        case 16:
        case 17:
        case 18:
            {
                throw new Error("Marshalling of primitive arrays are not supported.  Use the corresponding TypedArray instead.")
            }
        case 20:
            var dateValue = this.call_method(this.get_date_value, null, "md", [mono_obj]);
            return new Date(dateValue);
        case 21:
            var dateoffsetValue = this.call_method(this.object_to_string, null, "m", [mono_obj]);
            return dateoffsetValue;
        default:
            throw new Error("no idea on how to unbox object kind " + type)
        }
    },
    create_task_completion_source: function() {
        return this.call_method(this.create_tcs, null, "i", [-1])
    },
    set_task_result: function(tcs, result) {
        tcs.is_mono_tcs_result_set = true;
        this.call_method(this.set_tcs_result, null, "oo", [tcs, result]);
        if (tcs.is_mono_tcs_task_bound)
            this.free_task_completion_source(tcs)
    },
    set_task_failure: function(tcs, reason) {
        tcs.is_mono_tcs_result_set = true;
        this.call_method(this.set_tcs_failure, null, "os", [tcs, reason.toString()]);
        if (tcs.is_mono_tcs_task_bound)
            this.free_task_completion_source(tcs)
    },
    js_typedarray_to_heap: function(typedArray) {
        var numBytes = typedArray.length * typedArray.BYTES_PER_ELEMENT;
        var ptr = Module._malloc(numBytes);
        var heapBytes = new Uint8Array(Module.HEAPU8.buffer,ptr,numBytes);
        heapBytes.set(new Uint8Array(typedArray.buffer,typedArray.byteOffset,numBytes));
        return heapBytes
    },
    js_to_mono_obj: function(js_obj) {
        this.bindings_lazy_init();
        if (js_obj == null || js_obj == undefined)
            return 0;
        if (typeof js_obj === "number") {
            if (parseInt(js_obj) == js_obj)
                return this.call_method(this.box_js_int, null, "im", [js_obj]);
            return this.call_method(this.box_js_double, null, "dm", [js_obj])
        }
        if (typeof js_obj === "string")
            return this.js_string_to_mono_string(js_obj);
        if (typeof js_obj === "boolean")
            return this.call_method(this.box_js_bool, null, "im", [js_obj]);
        if (Promise.resolve(js_obj) === js_obj) {
            var the_task = this.try_extract_mono_obj(js_obj);
            if (the_task)
                return the_task;
            var tcs = this.create_task_completion_source();
            js_obj.then(function(result) {
                BINDING.set_task_result(tcs, result)
            }, function(reason) {
                BINDING.set_task_failure(tcs, reason)
            });
            return this.get_task_and_bind(tcs, js_obj)
        }
        if (js_obj.constructor.name === "Date")
            return this.call_method(this.create_date_time, null, "dm", [js_obj.getTime()]);
        return this.extract_mono_obj(js_obj)
    },
    js_typed_array_to_array: function(js_obj) {
        if (!!(js_obj.buffer instanceof ArrayBuffer && js_obj.BYTES_PER_ELEMENT)) {
            var arrayType = 0;
            if (js_obj instanceof Int8Array)
                arrayType = 11;
            if (js_obj instanceof Uint8Array)
                arrayType = 12;
            if (js_obj instanceof Uint8ClampedArray)
                arrayType = 12;
            if (js_obj instanceof Int16Array)
                arrayType = 13;
            if (js_obj instanceof Uint16Array)
                arrayType = 14;
            if (js_obj instanceof Int32Array)
                arrayType = 15;
            if (js_obj instanceof Uint32Array)
                arrayType = 16;
            if (js_obj instanceof Float32Array)
                arrayType = 17;
            if (js_obj instanceof Float64Array)
                arrayType = 18;
            var heapBytes = this.js_typedarray_to_heap(js_obj);
            var bufferArray = this.mono_typed_array_new(heapBytes.byteOffset, js_obj.length, js_obj.BYTES_PER_ELEMENT, arrayType);
            Module._free(heapBytes.byteOffset);
            return bufferArray
        } else {
            throw new Error("Object '" + js_obj + "' is not a typed array")
        }
    },
    typedarray_copy_to: function(typed_array, pinned_array, begin, end, bytes_per_element) {
        if (!!(typed_array.buffer instanceof ArrayBuffer && typed_array.BYTES_PER_ELEMENT)) {
            if (bytes_per_element !== typed_array.BYTES_PER_ELEMENT)
                throw new Error("Inconsistent element sizes: TypedArray.BYTES_PER_ELEMENT '" + typed_array.BYTES_PER_ELEMENT + "' sizeof managed element: '" + bytes_per_element + "'");
            var num_of_bytes = (end - begin) * bytes_per_element;
            var view_bytes = typed_array.length * typed_array.BYTES_PER_ELEMENT;
            if (num_of_bytes > view_bytes)
                num_of_bytes = view_bytes;
            var offset = begin * bytes_per_element;
            var heapBytes = new Uint8Array(Module.HEAPU8.buffer,pinned_array + offset,num_of_bytes);
            heapBytes.set(new Uint8Array(typed_array.buffer,typed_array.byteOffset,num_of_bytes));
            return num_of_bytes
        } else {
            throw new Error("Object '" + typed_array + "' is not a typed array")
        }
    },
    typedarray_copy_from: function(typed_array, pinned_array, begin, end, bytes_per_element) {
        if (!!(typed_array.buffer instanceof ArrayBuffer && typed_array.BYTES_PER_ELEMENT)) {
            if (bytes_per_element !== typed_array.BYTES_PER_ELEMENT)
                throw new Error("Inconsistent element sizes: TypedArray.BYTES_PER_ELEMENT '" + typed_array.BYTES_PER_ELEMENT + "' sizeof managed element: '" + bytes_per_element + "'");
            var num_of_bytes = (end - begin) * bytes_per_element;
            var view_bytes = typed_array.length * typed_array.BYTES_PER_ELEMENT;
            if (num_of_bytes > view_bytes)
                num_of_bytes = view_bytes;
            var typedarrayBytes = new Uint8Array(typed_array.buffer,0,num_of_bytes);
            var offset = begin * bytes_per_element;
            typedarrayBytes.set(Module.HEAPU8.subarray(pinned_array + offset, pinned_array + offset + num_of_bytes));
            return num_of_bytes
        } else {
            throw new Error("Object '" + typed_array + "' is not a typed array")
        }
    },
    typed_array_from: function(pinned_array, begin, end, bytes_per_element, type) {
        var newTypedArray = 0;
        switch (type) {
        case 5:
            newTypedArray = new Int8Array(end - begin);
            break;
        case 6:
            newTypedArray = new Uint8Array(end - begin);
            break;
        case 7:
            newTypedArray = new Int16Array(end - begin);
            break;
        case 8:
            newTypedArray = new Uint16Array(end - begin);
            break;
        case 9:
            newTypedArray = new Int32Array(end - begin);
            break;
        case 10:
            newTypedArray = new Uint32Array(end - begin);
            break;
        case 13:
            newTypedArray = new Float32Array(end - begin);
            break;
        case 14:
            newTypedArray = new Float64Array(end - begin);
            break;
        case 15:
            newTypedArray = new Uint8ClampedArray(end - begin);
            break
        }
        this.typedarray_copy_from(newTypedArray, pinned_array, begin, end, bytes_per_element);
        return newTypedArray
    },
    js_to_mono_enum: function(method, parmIdx, js_obj) {
        this.bindings_lazy_init();
        if (js_obj === null || typeof js_obj === "undefined")
            return 0;
        var monoObj = this.js_to_mono_obj(js_obj);
        var monoEnum = this.call_method(this.object_to_enum, null, "iimm", [method, parmIdx, monoObj]);
        return this.mono_unbox_enum(monoEnum)
    },
    wasm_binding_obj_new: function(js_obj_id, type) {
        return this.call_method(this.bind_js_obj, null, "io", [js_obj_id, type])
    },
    wasm_bind_existing: function(mono_obj, js_id) {
        return this.call_method(this.bind_existing_obj, null, "mi", [mono_obj, js_id])
    },
    wasm_bind_core_clr_obj: function(js_id, gc_handle) {
        return this.call_method(this.bind_core_clr_obj, null, "ii", [js_id, gc_handle])
    },
    wasm_unbind_js_obj: function(js_obj_id) {
        this.call_method(this.unbind_js_obj, null, "i", [js_obj_id])
    },
    wasm_unbind_js_obj_and_free: function(js_obj_id) {
        this.call_method(this.unbind_js_obj_and_free, null, "i", [js_obj_id])
    },
    wasm_get_js_id: function(mono_obj) {
        return this.call_method(this.get_js_id, null, "m", [mono_obj])
    },
    wasm_get_raw_obj: function(gchandle) {
        return this.call_method(this.get_raw_mono_obj, null, "im", [gchandle])
    },
    try_extract_mono_obj: function(js_obj) {
        if (js_obj === null || typeof js_obj === "undefined" || typeof js_obj.__mono_gchandle__ === "undefined")
            return 0;
        return this.wasm_get_raw_obj(js_obj.__mono_gchandle__)
    },
    mono_method_get_call_signature: function(method) {
        this.bindings_lazy_init();
        return this.call_method(this.get_call_sig, null, "i", [method])
    },
    get_task_and_bind: function(tcs, js_obj) {
        var gc_handle = this.mono_wasm_free_list.length ? this.mono_wasm_free_list.pop() : this.mono_wasm_ref_counter++;
        var task_gchandle = this.call_method(this.tcs_get_task_and_bind, null, "oi", [tcs, gc_handle + 1]);
        js_obj.__mono_gchandle__ = task_gchandle;
        this.mono_wasm_object_registry[gc_handle] = js_obj;
        this.free_task_completion_source(tcs);
        tcs.is_mono_tcs_task_bound = true;
        js_obj.__mono_bound_tcs__ = tcs.__mono_gchandle__;
        tcs.__mono_bound_task__ = js_obj.__mono_gchandle__;
        return this.wasm_get_raw_obj(js_obj.__mono_gchandle__)
    },
    free_task_completion_source: function(tcs) {
        if (tcs.is_mono_tcs_result_set) {
            this.call_method(this.unbind_raw_obj_and_free, null, "ii", [tcs.__mono_gchandle__])
        }
        if (tcs.__mono_bound_task__) {
            this.call_method(this.unbind_raw_obj_and_free, null, "ii", [tcs.__mono_bound_task__])
        }
    },
    extract_mono_obj: function(js_obj) {
        if (js_obj === null || typeof js_obj === "undefined")
            return 0;
        if (!js_obj.is_mono_bridged_obj) {
            var gc_handle = this.mono_wasm_register_obj(js_obj);
            return this.wasm_get_raw_obj(gc_handle)
        }
        return this.wasm_get_raw_obj(js_obj.__mono_gchandle__)
    },
    extract_js_obj: function(mono_obj) {
        if (mono_obj == 0)
            return null;
        var js_id = this.wasm_get_js_id(mono_obj);
        if (js_id > 0)
            return this.mono_wasm_require_handle(js_id);
        var gcHandle = this.mono_wasm_free_list.length ? this.mono_wasm_free_list.pop() : this.mono_wasm_ref_counter++;
        var js_obj = {
            __mono_gchandle__: this.wasm_bind_existing(mono_obj, gcHandle + 1),
            is_mono_bridged_obj: true
        };
        this.mono_wasm_object_registry[gcHandle] = js_obj;
        return js_obj
    },
    call_method: function(method, this_arg, args_marshal, args) {
        this.bindings_lazy_init();
        var extra_args_mem = 0;
        for (var i = 0; i < args.length; ++i) {
            if (args_marshal[i] == "i" || args_marshal[i] == "f" || args_marshal[i] == "l" || args_marshal[i] == "d" || args_marshal[i] == "j" || args_marshal[i] == "k")
                extra_args_mem += 8
        }
        var extra_args_mem = extra_args_mem ? Module._malloc(extra_args_mem) : 0;
        var extra_arg_idx = 0;
        var args_mem = Module._malloc(args.length * 4);
        var eh_throw = Module._malloc(4);
        for (var i = 0; i < args.length; ++i) {
            if (args_marshal[i] == "s") {
                Module.setValue(args_mem + i * 4, this.js_string_to_mono_string(args[i]), "i32")
            } else if (args_marshal[i] == "m") {
                Module.setValue(args_mem + i * 4, args[i], "i32")
            } else if (args_marshal[i] == "o") {
                Module.setValue(args_mem + i * 4, this.js_to_mono_obj(args[i]), "i32")
            } else if (args_marshal[i] == "j" || args_marshal[i] == "k") {
                var enumVal = this.js_to_mono_enum(method, i, args[i]);
                var extra_cell = extra_args_mem + extra_arg_idx;
                extra_arg_idx += 8;
                if (args_marshal[i] == "j")
                    Module.setValue(extra_cell, enumVal, "i32");
                else if (args_marshal[i] == "k")
                    Module.setValue(extra_cell, enumVal, "i64");
                Module.setValue(args_mem + i * 4, extra_cell, "i32")
            } else if (args_marshal[i] == "i" || args_marshal[i] == "f" || args_marshal[i] == "l" || args_marshal[i] == "d") {
                var extra_cell = extra_args_mem + extra_arg_idx;
                extra_arg_idx += 8;
                if (args_marshal[i] == "i")
                    Module.setValue(extra_cell, args[i], "i32");
                else if (args_marshal[i] == "l")
                    Module.setValue(extra_cell, args[i], "i64");
                else if (args_marshal[i] == "f")
                    Module.setValue(extra_cell, args[i], "float");
                else
                    Module.setValue(extra_cell, args[i], "double");
                Module.setValue(args_mem + i * 4, extra_cell, "i32")
            }
        }
        Module.setValue(eh_throw, 0, "i32");
        var res = this.invoke_method(method, this_arg, args_mem, eh_throw);
        var eh_res = Module.getValue(eh_throw, "i32");
        if (extra_args_mem)
            Module._free(extra_args_mem);
        Module._free(args_mem);
        Module._free(eh_throw);
        if (eh_res != 0) {
            var msg = this.conv_string(res);
            throw new Error(msg)
        }
        if (args_marshal !== null && typeof args_marshal !== "undefined") {
            if (args_marshal.length >= args.length && args_marshal[args.length] === "m")
                return res
        }
        return this.unbox_mono_obj(res)
    },
    invoke_delegate: function(delegate_obj, js_args) {
        this.bindings_lazy_init();
        if (!this.delegate_dynamic_invoke) {
            if (!this.corlib)
                this.corlib = this.assembly_load("mscorlib");
            if (!this.delegate_class)
                this.delegate_class = this.find_class(this.corlib, "System", "Delegate");
            if (!this.delegate_class) {
                throw new Error("System.Delegate class can not be resolved.")
            }
            this.delegate_dynamic_invoke = this.find_method(this.delegate_class, "DynamicInvoke", -1)
        }
        var mono_args = this.js_array_to_mono_array(js_args);
        if (!this.delegate_dynamic_invoke)
            throw new Error("System.Delegate.DynamicInvoke method can not be resolved.");
        return this.call_method(this.delegate_dynamic_invoke, this.extract_mono_obj(delegate_obj), "mo", [mono_args])
    },
    resolve_method_fqn: function(fqn) {
        var assembly = fqn.substring(fqn.indexOf("[") + 1, fqn.indexOf("]")).trim();
        fqn = fqn.substring(fqn.indexOf("]") + 1).trim();
        var methodname = fqn.substring(fqn.indexOf(":") + 1);
        fqn = fqn.substring(0, fqn.indexOf(":")).trim();
        var namespace = "";
        var classname = fqn;
        if (fqn.indexOf(".") != -1) {
            var idx = fqn.lastIndexOf(".");
            namespace = fqn.substring(0, idx);
            classname = fqn.substring(idx + 1)
        }
        var asm = this.assembly_load(assembly);
        if (!asm)
            throw new Error("Could not find assembly: " + assembly);
        var klass = this.find_class(asm, namespace, classname);
        if (!klass)
            throw new Error("Could not find class: " + namespace + ":" + classname);
        var method = this.find_method(klass, methodname, -1);
        if (!method)
            throw new Error("Could not find method: " + methodname);
        return method
    },
    call_static_method: function(fqn, args, signature) {
        this.bindings_lazy_init();
        var method = this.resolve_method_fqn(fqn);
        if (typeof signature === "undefined")
            signature = Module.mono_method_get_call_signature(method);
        return this.call_method(method, null, signature, args)
    },
    bind_static_method: function(fqn, signature) {
        this.bindings_lazy_init();
        var method = this.resolve_method_fqn(fqn);
        if (typeof signature === "undefined")
            signature = Module.mono_method_get_call_signature(method);
        return function() {
            return BINDING.call_method(method, null, signature, arguments)
        }
    },
    wasm_get_core_type: function(obj) {
        return this.call_method(this.get_core_type, null, "so", ["WebAssembly.Core." + obj.constructor.name])
    },
    get_wasm_type: function(obj) {
        var coreType = obj[Symbol.for("wasm type")];
        if (typeof coreType === "undefined") {
            switch (obj.constructor.name) {
            case "Array":
                coreType = this.wasm_get_core_type(obj);
                if (typeof coreType !== "undefined") {
                    Array.prototype[Symbol.for("wasm type")] = coreType
                }
                break;
            case "ArrayBuffer":
                coreType = this.wasm_get_core_type(obj);
                if (typeof coreType !== "undefined") {
                    ArrayBuffer.prototype[Symbol.for("wasm type")] = coreType
                }
                break;
            case "Int8Array":
                coreType = this.wasm_get_core_type(obj);
                if (typeof coreType !== "undefined") {
                    Int8Array.prototype[Symbol.for("wasm type")] = coreType
                }
                break;
            case "Uint8Array":
                coreType = this.wasm_get_core_type(obj);
                if (typeof coreType !== "undefined") {
                    Uint8Array.prototype[Symbol.for("wasm type")] = coreType
                }
                break;
            case "Uint8ClampedArray":
                coreType = this.wasm_get_core_type(obj);
                if (typeof coreType !== "undefined") {
                    Uint8ClampedArray.prototype[Symbol.for("wasm type")] = coreType
                }
                break;
            case "Int16Array":
                coreType = this.wasm_get_core_type(obj);
                if (typeof coreType !== "undefined") {
                    Int16Array.prototype[Symbol.for("wasm type")] = coreType
                }
                break;
            case "Uint16Array":
                coreType = this.wasm_get_core_type(obj);
                if (typeof coreType !== "undefined") {
                    Uint16Array.prototype[Symbol.for("wasm type")] = coreType
                }
                break;
            case "Int32Array":
                coreType = this.wasm_get_core_type(obj);
                if (typeof coreType !== "undefined") {
                    Int32Array.prototype[Symbol.for("wasm type")] = coreType
                }
                break;
            case "Uint32Array":
                coreType = this.wasm_get_core_type(obj);
                if (typeof coreType !== "undefined") {
                    Uint32Array.prototype[Symbol.for("wasm type")] = coreType
                }
                return coreType;
            case "Float32Array":
                coreType = this.wasm_get_core_type(obj);
                if (typeof coreType !== "undefined") {
                    Float32Array.prototype[Symbol.for("wasm type")] = coreType
                }
                break;
            case "Float64Array":
                coreType = this.wasm_get_core_type(obj);
                if (typeof coreType !== "undefined") {
                    Float64Array.prototype[Symbol.for("wasm type")] = coreType
                }
                break;
            case "Function":
                coreType = this.wasm_get_core_type(obj);
                if (typeof coreType !== "undefined") {
                    Function.prototype[Symbol.for("wasm type")] = coreType
                }
                break;
            case "SharedArrayBuffer":
                coreType = this.wasm_get_core_type(obj);
                if (typeof coreType !== "undefined") {
                    SharedArrayBuffer.prototype[Symbol.for("wasm type")] = coreType
                }
                break;
            case "DataView":
                coreType = this.wasm_get_core_type(obj);
                if (typeof coreType !== "undefined") {
                    DataView.prototype[Symbol.for("wasm type")] = coreType
                }
                break
            }
        }
        return coreType
    },
    mono_wasm_register_obj: function(obj) {
        var gc_handle = undefined;
        if (obj !== null && typeof obj !== "undefined") {
            gc_handle = obj.__mono_gchandle__;
            if (typeof gc_handle === "undefined") {
                var handle = this.mono_wasm_free_list.length ? this.mono_wasm_free_list.pop() : this.mono_wasm_ref_counter++;
                obj.__mono_jshandle__ = handle;
                var wasm_type = this.get_wasm_type(obj);
                gc_handle = obj.__mono_gchandle__ = this.wasm_binding_obj_new(handle + 1, wasm_type);
                this.mono_wasm_object_registry[handle] = obj
            }
        }
        return gc_handle
    },
    mono_wasm_require_handle: function(handle) {
        if (handle > 0)
            return this.mono_wasm_object_registry[handle - 1];
        return null
    },
    mono_wasm_unregister_obj: function(js_id) {
        var obj = this.mono_wasm_object_registry[js_id - 1];
        if (typeof obj !== "undefined" && obj !== null) {
            if (typeof ___mono_wasm_global___ !== "undefined" && ___mono_wasm_global___ === obj)
                return obj;
            var gc_handle = obj.__mono_gchandle__;
            if (typeof gc_handle !== "undefined") {
                this.wasm_unbind_js_obj_and_free(js_id);
                obj.__mono_gchandle__ = undefined;
                obj.__mono_jshandle__ = undefined;
                this.mono_wasm_object_registry[js_id - 1] = undefined;
                this.mono_wasm_free_list.push(js_id - 1)
            }
        }
        return obj
    },
    mono_wasm_free_handle: function(handle) {
        this.mono_wasm_unregister_obj(handle)
    },
    mono_wasm_free_raw_object: function(js_id) {
        var obj = this.mono_wasm_object_registry[js_id - 1];
        if (typeof obj !== "undefined" && obj !== null) {
            if (typeof ___mono_wasm_global___ !== "undefined" && ___mono_wasm_global___ === obj)
                return obj;
            var gc_handle = obj.__mono_gchandle__;
            if (typeof gc_handle !== "undefined") {
                obj.__mono_gchandle__ = undefined;
                obj.__mono_jshandle__ = undefined;
                this.mono_wasm_object_registry[js_id - 1] = undefined;
                this.mono_wasm_free_list.push(js_id - 1)
            }
        }
        return obj
    },
    mono_wasm_get_global: function() {
        function testGlobal(obj) {
            obj["___mono_wasm_global___"] = obj;
            var success = typeof ___mono_wasm_global___ === "object" && obj["___mono_wasm_global___"] === obj;
            if (!success) {
                delete obj["___mono_wasm_global___"]
            }
            return success
        }
        if (typeof ___mono_wasm_global___ === "object") {
            return ___mono_wasm_global___
        }
        if (typeof global === "object" && testGlobal(global)) {
            ___mono_wasm_global___ = global
        } else if (typeof window === "object" && testGlobal(window)) {
            ___mono_wasm_global___ = window
        } else if (testGlobal(function() {
            return Function
        }()("return this")())) {
            ___mono_wasm_global___ = function() {
                return Function
            }()("return this")()
        }
        if (typeof ___mono_wasm_global___ === "object") {
            return ___mono_wasm_global___
        }
        throw Error("unable to get mono wasm global object.")
    }
};
function _mono_wasm_bind_core_object(js_handle, gc_handle, is_exception) {
    BINDING.bindings_lazy_init();
    var requireObject = BINDING.mono_wasm_require_handle(js_handle);
    if (!requireObject) {
        setValue(is_exception, 1, "i32");
        return BINDING.js_string_to_mono_string("Invalid JS object handle '" + js_handle + "'")
    }
    BINDING.wasm_bind_core_clr_obj(js_handle, gc_handle);
    requireObject.__mono_gchandle__ = gc_handle;
    return gc_handle
}
function _mono_wasm_bind_host_object(js_handle, gc_handle, is_exception) {
    BINDING.bindings_lazy_init();
    var requireObject = BINDING.mono_wasm_require_handle(js_handle);
    if (!requireObject) {
        setValue(is_exception, 1, "i32");
        return BINDING.js_string_to_mono_string("Invalid JS object handle '" + js_handle + "'")
    }
    BINDING.wasm_bind_core_clr_obj(js_handle, gc_handle);
    requireObject.__mono_gchandle__ = gc_handle;
    return gc_handle
}
function _mono_wasm_fire_bp() {
    console.log("mono_wasm_fire_bp");
    debugger
}
function _mono_wasm_get_by_index(js_handle, property_index, is_exception) {
    BINDING.bindings_lazy_init();
    var obj = BINDING.mono_wasm_require_handle(js_handle);
    if (!obj) {
        setValue(is_exception, 1, "i32");
        return BINDING.js_string_to_mono_string("Invalid JS object handle '" + js_handle + "'")
    }
    try {
        var m = obj[property_index];
        return BINDING.js_to_mono_obj(m)
    } catch (e) {
        var res = e.toString();
        setValue(is_exception, 1, "i32");
        if (res === null || typeof res === "undefined")
            res = "unknown exception";
        return BINDING.js_string_to_mono_string(res)
    }
}
function _mono_wasm_get_global_object(global_name, is_exception) {
    BINDING.bindings_lazy_init();
    var js_name = BINDING.conv_string(global_name);
    var globalObj = undefined;
    if (!js_name) {
        globalObj = BINDING.mono_wasm_get_global()
    } else {
        globalObj = BINDING.mono_wasm_get_global()[js_name]
    }
    if (globalObj === null || typeof globalObj === undefined) {
        setValue(is_exception, 1, "i32");
        return BINDING.js_string_to_mono_string("Global object '" + js_name + "' not found.")
    }
    return BINDING.js_to_mono_obj(globalObj)
}
function _mono_wasm_get_object_property(js_handle, property_name, is_exception) {
    BINDING.bindings_lazy_init();
    var obj = BINDING.mono_wasm_require_handle(js_handle);
    if (!obj) {
        setValue(is_exception, 1, "i32");
        return BINDING.js_string_to_mono_string("Invalid JS object handle '" + js_handle + "'")
    }
    var js_name = BINDING.conv_string(property_name);
    if (!js_name) {
        setValue(is_exception, 1, "i32");
        return BINDING.js_string_to_mono_string("Invalid property name object '" + js_name + "'")
    }
    var res;
    try {
        var m = obj[js_name];
        if (m === Object(m) && obj.__is_mono_proxied__)
            m.__is_mono_proxied__ = true;
        return BINDING.js_to_mono_obj(m)
    } catch (e) {
        var res = e.toString();
        setValue(is_exception, 1, "i32");
        if (res === null || typeof res === "undefined")
            res = "unknown exception";
        return BINDING.js_string_to_mono_string(res)
    }
}
var DOTNET = {
    _dotnet_get_global: function() {
        function testGlobal(obj) {
            obj["___dotnet_global___"] = obj;
            var success = typeof ___dotnet_global___ === "object" && obj["___dotnet_global___"] === obj;
            if (!success) {
                delete obj["___dotnet_global___"]
            }
            return success
        }
        if (typeof ___dotnet_global___ === "object") {
            return ___dotnet_global___
        }
        if (typeof global === "object" && testGlobal(global)) {
            ___dotnet_global___ = global
        } else if (typeof window === "object" && testGlobal(window)) {
            ___dotnet_global___ = window
        }
        if (typeof ___dotnet_global___ === "object") {
            return ___dotnet_global___
        }
        throw Error("unable to get DotNet global object.")
    },
    conv_string: function(mono_obj) {
        if (mono_obj == 0)
            return null;
        if (!this.mono_string_get_utf8)
            this.mono_string_get_utf8 = Module.cwrap("mono_wasm_string_get_utf8", "number", ["number"]);
        var raw = this.mono_string_get_utf8(mono_obj);
        var res = Module.UTF8ToString(raw);
        Module._free(raw);
        return res
    }
};
function _mono_wasm_invoke_js_marshalled(exceptionMessage, asyncHandleLongPtr, functionName, argsJson) {
    var mono_string = DOTNET._dotnet_get_global()._mono_string_cached || (DOTNET._dotnet_get_global()._mono_string_cached = Module.cwrap("mono_wasm_string_from_js", "number", ["string"]));
    try {
        var u32Index = asyncHandleLongPtr >> 2;
        var asyncHandleJsNumber = Module.HEAPU32[u32Index + 1] * 4294967296 + Module.HEAPU32[u32Index];
        var funcNameJsString = DOTNET.conv_string(functionName);
        var argsJsonJsString = argsJson && DOTNET.conv_string(argsJson);
        var dotNetExports = DOTNET._dotnet_get_global().DotNet;
        if (!dotNetExports) {
            throw new Error("The Microsoft.JSInterop.js library is not loaded.")
        }
        if (asyncHandleJsNumber) {
            dotNetExports.jsCallDispatcher.beginInvokeJSFromDotNet(asyncHandleJsNumber, funcNameJsString, argsJsonJsString);
            return 0
        } else {
            var resultJson = dotNetExports.jsCallDispatcher.invokeJSFromDotNet(funcNameJsString, argsJsonJsString);
            return resultJson === null ? 0 : mono_string(resultJson)
        }
    } catch (ex) {
        var exceptionJsString = ex.message + "\n" + ex.stack;
        var exceptionSystemString = mono_string(exceptionJsString);
        setValue(exceptionMessage, exceptionSystemString, "i32");
        return 0
    }
}
function _mono_wasm_invoke_js_unmarshalled(exceptionMessage, funcName, arg0, arg1, arg2) {
    try {
        var funcNameJsString = DOTNET.conv_string(funcName);
        var dotNetExports = DOTNET._dotnet_get_global().DotNet;
        if (!dotNetExports) {
            throw new Error("The Microsoft.JSInterop.js library is not loaded.")
        }
        var funcInstance = dotNetExports.jsCallDispatcher.findJSFunction(funcNameJsString);
        return funcInstance.call(null, arg0, arg1, arg2)
    } catch (ex) {
        var exceptionJsString = ex.message + "\n" + ex.stack;
        var mono_string = Module.cwrap("mono_wasm_string_from_js", "number", ["string"]);
        var exceptionSystemString = mono_string(exceptionJsString);
        setValue(exceptionMessage, exceptionSystemString, "i32");
        return 0
    }
}
function _mono_wasm_invoke_js_with_args(js_handle, method_name, args, is_exception) {
    BINDING.bindings_lazy_init();
    var obj = BINDING.get_js_obj(js_handle);
    if (!obj) {
        setValue(is_exception, 1, "i32");
        return BINDING.js_string_to_mono_string("Invalid JS object handle '" + js_handle + "'")
    }
    var js_name = BINDING.conv_string(method_name);
    if (!js_name) {
        setValue(is_exception, 1, "i32");
        return BINDING.js_string_to_mono_string("Invalid method name object '" + method_name + "'")
    }
    var js_args = BINDING.mono_array_to_js_array(args);
    var res;
    try {
        var m = obj[js_name];
        if (typeof m === "undefined")
            throw new Error("Method: '" + js_name + "' not found for: '" + Object.prototype.toString.call(obj) + "'");
        var res = m.apply(obj, js_args);
        return BINDING.js_to_mono_obj(res)
    } catch (e) {
        var res = e.toString();
        setValue(is_exception, 1, "i32");
        if (res === null || res === undefined)
            res = "unknown exception";
        return BINDING.js_string_to_mono_string(res)
    }
}
function _mono_wasm_new(core_name, args, is_exception) {
    BINDING.bindings_lazy_init();
    var js_name = BINDING.conv_string(core_name);
    if (!js_name) {
        setValue(is_exception, 1, "i32");
        return BINDING.js_string_to_mono_string("Core object '" + js_name + "' not found.")
    }
    var coreObj = BINDING.mono_wasm_get_global()[js_name];
    if (coreObj === null || typeof coreObj === undefined) {
        setValue(is_exception, 1, "i32");
        return BINDING.js_string_to_mono_string("Global object '" + js_name + "' not found.")
    }
    var js_args = BINDING.mono_array_to_js_array(args);
    try {
        var allocator = function(constructor, js_args) {
            var argsList = new Array;
            argsList[0] = constructor;
            if (js_args)
                argsList = argsList.concat(js_args);
            var obj = new (constructor.bind.apply(constructor, argsList));
            return obj
        };
        var res = allocator(coreObj, js_args);
        var gc_handle = BINDING.mono_wasm_free_list.length ? BINDING.mono_wasm_free_list.pop() : BINDING.mono_wasm_ref_counter++;
        BINDING.mono_wasm_object_registry[gc_handle] = res;
        return BINDING.js_to_mono_obj(gc_handle + 1)
    } catch (e) {
        var res = e.toString();
        setValue(is_exception, 1, "i32");
        if (res === null || res === undefined)
            res = "Error allocating object.";
        return BINDING.js_string_to_mono_string(res)
    }
}
function _mono_wasm_new_object(object_handle_or_function, args, is_exception) {
    BINDING.bindings_lazy_init();
    if (!object_handle_or_function) {
        return BINDING.js_to_mono_obj({})
    } else {
        var requireObject;
        if (typeof object_handle_or_function === "function")
            requireObject = object_handle_or_function;
        else
            requireObject = BINDING.mono_wasm_require_handle(object_handle_or_function);
        if (!requireObject) {
            setValue(is_exception, 1, "i32");
            return BINDING.js_string_to_mono_string("Invalid JS object handle '" + object_handle_or_function + "'")
        }
        var js_args = BINDING.mono_array_to_js_array(args);
        try {
            var allocator = function(constructor, js_args) {
                var argsList = new Array;
                argsList[0] = constructor;
                if (js_args)
                    argsList = argsList.concat(js_args);
                var obj = new (constructor.bind.apply(constructor, argsList));
                return obj
            };
            var res = allocator(requireObject, js_args);
            return BINDING.extract_mono_obj(res)
        } catch (e) {
            var res = e.toString();
            setValue(is_exception, 1, "i32");
            if (res === null || res === undefined)
                res = "Error allocating object.";
            return BINDING.js_string_to_mono_string(res)
        }
    }
}
function _mono_wasm_release_handle(js_handle, is_exception) {
    BINDING.bindings_lazy_init();
    BINDING.mono_wasm_free_handle(js_handle)
}
function _mono_wasm_release_object(js_handle, is_exception) {
    BINDING.bindings_lazy_init();
    BINDING.mono_wasm_free_raw_object(js_handle)
}
function _mono_wasm_set_by_index(js_handle, property_index, value, is_exception) {
    BINDING.bindings_lazy_init();
    var obj = BINDING.mono_wasm_require_handle(js_handle);
    if (!obj) {
        setValue(is_exception, 1, "i32");
        return BINDING.js_string_to_mono_string("Invalid JS object handle '" + js_handle + "'")
    }
    var js_value = BINDING.unbox_mono_obj(value);
    try {
        obj[property_index] = js_value;
        return true
    } catch (e) {
        var res = e.toString();
        setValue(is_exception, 1, "i32");
        if (res === null || typeof res === "undefined")
            res = "unknown exception";
        return BINDING.js_string_to_mono_string(res)
    }
}
function _mono_wasm_set_object_property(js_handle, property_name, value, createIfNotExist, hasOwnProperty, is_exception) {
    BINDING.bindings_lazy_init();
    var requireObject = BINDING.mono_wasm_require_handle(js_handle);
    if (!requireObject) {
        setValue(is_exception, 1, "i32");
        return BINDING.js_string_to_mono_string("Invalid JS object handle '" + js_handle + "'")
    }
    var property = BINDING.conv_string(property_name);
    if (!property) {
        setValue(is_exception, 1, "i32");
        return BINDING.js_string_to_mono_string("Invalid property name object '" + property_name + "'")
    }
    var result = false;
    var js_value = BINDING.unbox_mono_obj(value);
    if (createIfNotExist) {
        requireObject[property] = js_value;
        result = true
    } else {
        result = false;
        if (!createIfNotExist) {
            if (!requireObject.hasOwnProperty(property))
                return false
        }
        if (hasOwnProperty === true) {
            if (requireObject.hasOwnProperty(property)) {
                requireObject[property] = js_value;
                result = true
            }
        } else {
            requireObject[property] = js_value;
            result = true
        }
    }
    return BINDING.call_method(BINDING.box_js_bool, null, "im", [result])
}
function _mono_wasm_typed_array_copy_from(js_handle, pinned_array, begin, end, bytes_per_element, is_exception) {
    BINDING.bindings_lazy_init();
    var requireObject = BINDING.mono_wasm_require_handle(js_handle);
    if (!requireObject) {
        setValue(is_exception, 1, "i32");
        return BINDING.js_string_to_mono_string("Invalid JS object handle '" + js_handle + "'")
    }
    var res = BINDING.typedarray_copy_from(requireObject, pinned_array, begin, end, bytes_per_element);
    return BINDING.js_to_mono_obj(res)
}
function _mono_wasm_typed_array_copy_to(js_handle, pinned_array, begin, end, bytes_per_element, is_exception) {
    BINDING.bindings_lazy_init();
    var requireObject = BINDING.mono_wasm_require_handle(js_handle);
    if (!requireObject) {
        setValue(is_exception, 1, "i32");
        return BINDING.js_string_to_mono_string("Invalid JS object handle '" + js_handle + "'")
    }
    var res = BINDING.typedarray_copy_to(requireObject, pinned_array, begin, end, bytes_per_element);
    return BINDING.js_to_mono_obj(res)
}
function _mono_wasm_typed_array_from(pinned_array, begin, end, bytes_per_element, type, is_exception) {
    BINDING.bindings_lazy_init();
    var res = BINDING.typed_array_from(pinned_array, begin, end, bytes_per_element, type);
    return BINDING.js_to_mono_obj(res)
}
function _mono_wasm_typed_array_to_array(js_handle, is_exception) {
    BINDING.bindings_lazy_init();
    var requireObject = BINDING.mono_wasm_require_handle(js_handle);
    if (!requireObject) {
        setValue(is_exception, 1, "i32");
        return BINDING.js_string_to_mono_string("Invalid JS object handle '" + js_handle + "'")
    }
    return BINDING.js_typed_array_to_array(requireObject)
}
function _usleep(useconds) {
    var msec = useconds / 1e3;
    if ((ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) && self["performance"] && self["performance"]["now"]) {
        var start = self["performance"]["now"]();
        while (self["performance"]["now"]() - start < msec) {}
    } else {
        var start = Date.now();
        while (Date.now() - start < msec) {}
    }
    return 0
}
Module["_usleep"] = _usleep;
function _nanosleep(rqtp, rmtp) {
    if (rqtp === 0) {
        ___setErrNo(22);
        return -1
    }
    var seconds = HEAP32[rqtp >> 2];
    var nanoseconds = HEAP32[rqtp + 4 >> 2];
    if (nanoseconds < 0 || nanoseconds > 999999999 || seconds < 0) {
        ___setErrNo(22);
        return -1
    }
    if (rmtp !== 0) {
        HEAP32[rmtp >> 2] = 0;
        HEAP32[rmtp + 4 >> 2] = 0
    }
    return _usleep(seconds * 1e6 + nanoseconds / 1e3)
}
function _pthread_cleanup_pop() {
    assert(_pthread_cleanup_push.level == __ATEXIT__.length, "cannot pop if something else added meanwhile!");
    __ATEXIT__.pop();
    _pthread_cleanup_push.level = __ATEXIT__.length
}
function _pthread_cleanup_push(routine, arg) {
    __ATEXIT__.push(function() {
        dynCall_vi(routine, arg)
    });
    _pthread_cleanup_push.level = __ATEXIT__.length
}
function _pthread_cond_broadcast(x) {
    x = x | 0;
    return 0
}
function _pthread_cond_destroy() {
    return 0
}
function _pthread_cond_init() {
    return 0
}
function _pthread_cond_signal() {
    return 0
}
function _pthread_cond_timedwait() {
    return 0
}
function _pthread_cond_wait() {
    return 0
}
function _pthread_mutexattr_destroy() {}
function _pthread_mutexattr_init() {}
function _pthread_mutexattr_setprotocol() {}
function _pthread_mutexattr_settype() {}
function _pthread_setcancelstate() {
    return 0
}
function abortOnCannotGrowMemory(requestedSize) {
    abort("OOM")
}
function emscripten_realloc_buffer(size) {
    var PAGE_MULTIPLE = 65536;
    size = alignUp(size, PAGE_MULTIPLE);
    var oldSize = buffer.byteLength;
    try {
        var result = wasmMemory.grow((size - oldSize) / 65536);
        if (result !== (-1 | 0)) {
            buffer = wasmMemory.buffer;
            return true
        } else {
            return false
        }
    } catch (e) {
        return false
    }
}
function _emscripten_resize_heap(requestedSize) {
    var oldSize = _emscripten_get_heap_size();
    var PAGE_MULTIPLE = 65536;
    var LIMIT = 2147483648 - PAGE_MULTIPLE;
    if (requestedSize > LIMIT) {
        return false
    }
    var MIN_TOTAL_MEMORY = 16777216;
    var newSize = Math.max(oldSize, MIN_TOTAL_MEMORY);
    while (newSize < requestedSize) {
        if (newSize <= 536870912) {
            newSize = alignUp(2 * newSize, PAGE_MULTIPLE)
        } else {
            newSize = Math.min(alignUp((3 * newSize + 2147483648) / 4, PAGE_MULTIPLE), LIMIT)
        }
    }
    if (!emscripten_realloc_buffer(newSize)) {
        return false
    }
    updateGlobalBufferViews();
    return true
}
function _sbrk(increment) {
    increment = increment | 0;
    var oldDynamicTop = 0;
    var newDynamicTop = 0;
    var totalMemory = 0;
    totalMemory = _emscripten_get_heap_size() | 0;
    oldDynamicTop = HEAP32[DYNAMICTOP_PTR >> 2] | 0;
    newDynamicTop = oldDynamicTop + increment | 0;
    if ((increment | 0) > 0 & (newDynamicTop | 0) < (oldDynamicTop | 0) | (newDynamicTop | 0) < 0) {
        abortOnCannotGrowMemory(newDynamicTop | 0) | 0;
        ___setErrNo(12);
        return -1
    }
    if ((newDynamicTop | 0) > (totalMemory | 0)) {
        if (_emscripten_resize_heap(newDynamicTop | 0) | 0) {} else {
            ___setErrNo(12);
            return -1
        }
    }
    HEAP32[DYNAMICTOP_PTR >> 2] = newDynamicTop | 0;
    return oldDynamicTop | 0
}
function _schedule_background_exec() {
    ++MONO.pump_count;
    if (ENVIRONMENT_IS_WEB) {
        window.setTimeout(MONO.pump_message, 0)
    }
}
function _sem_destroy() {}
function _sem_init() {}
function _sem_post() {}
function _sem_trywait() {}
function _sem_wait() {}
function _setenv(envname, envval, overwrite) {
    if (envname === 0) {
        ___setErrNo(22);
        return -1
    }
    var name = UTF8ToString(envname);
    var val = UTF8ToString(envval);
    if (name === "" || name.indexOf("=") !== -1) {
        ___setErrNo(22);
        return -1
    }
    if (ENV.hasOwnProperty(name) && !overwrite)
        return 0;
    ENV[name] = val;
    ___buildEnvironment(__get_environ());
    return 0
}
function _sigaction(signum, act, oldact) {
    return 0
}
function _sigemptyset(set) {
    HEAP32[set >> 2] = 0;
    return 0
}
var _sqrt = Math_sqrt;
var _sqrtf = Math_sqrt;
function __isLeapYear(year) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}
function __arraySum(array, index) {
    var sum = 0;
    for (var i = 0; i <= index; sum += array[i++])
        ;
    return sum
}
var __MONTH_DAYS_LEAP = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
var __MONTH_DAYS_REGULAR = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function __addDays(date, days) {
    var newDate = new Date(date.getTime());
    while (days > 0) {
        var leap = __isLeapYear(newDate.getFullYear());
        var currentMonth = newDate.getMonth();
        var daysInCurrentMonth = (leap ? __MONTH_DAYS_LEAP : __MONTH_DAYS_REGULAR)[currentMonth];
        if (days > daysInCurrentMonth - newDate.getDate()) {
            days -= daysInCurrentMonth - newDate.getDate() + 1;
            newDate.setDate(1);
            if (currentMonth < 11) {
                newDate.setMonth(currentMonth + 1)
            } else {
                newDate.setMonth(0);
                newDate.setFullYear(newDate.getFullYear() + 1)
            }
        } else {
            newDate.setDate(newDate.getDate() + days);
            return newDate
        }
    }
    return newDate
}
function _strftime(s, maxsize, format, tm) {
    var tm_zone = HEAP32[tm + 40 >> 2];
    var date = {
        tm_sec: HEAP32[tm >> 2],
        tm_min: HEAP32[tm + 4 >> 2],
        tm_hour: HEAP32[tm + 8 >> 2],
        tm_mday: HEAP32[tm + 12 >> 2],
        tm_mon: HEAP32[tm + 16 >> 2],
        tm_year: HEAP32[tm + 20 >> 2],
        tm_wday: HEAP32[tm + 24 >> 2],
        tm_yday: HEAP32[tm + 28 >> 2],
        tm_isdst: HEAP32[tm + 32 >> 2],
        tm_gmtoff: HEAP32[tm + 36 >> 2],
        tm_zone: tm_zone ? UTF8ToString(tm_zone) : ""
    };
    var pattern = UTF8ToString(format);
    var EXPANSION_RULES_1 = {
        "%c": "%a %b %d %H:%M:%S %Y",
        "%D": "%m/%d/%y",
        "%F": "%Y-%m-%d",
        "%h": "%b",
        "%r": "%I:%M:%S %p",
        "%R": "%H:%M",
        "%T": "%H:%M:%S",
        "%x": "%m/%d/%y",
        "%X": "%H:%M:%S",
        "%Ec": "%c",
        "%EC": "%C",
        "%Ex": "%m/%d/%y",
        "%EX": "%H:%M:%S",
        "%Ey": "%y",
        "%EY": "%Y",
        "%Od": "%d",
        "%Oe": "%e",
        "%OH": "%H",
        "%OI": "%I",
        "%Om": "%m",
        "%OM": "%M",
        "%OS": "%S",
        "%Ou": "%u",
        "%OU": "%U",
        "%OV": "%V",
        "%Ow": "%w",
        "%OW": "%W",
        "%Oy": "%y"
    };
    for (var rule in EXPANSION_RULES_1) {
        pattern = pattern.replace(new RegExp(rule,"g"), EXPANSION_RULES_1[rule])
    }
    var WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    function leadingSomething(value, digits, character) {
        var str = typeof value === "number" ? value.toString() : value || "";
        while (str.length < digits) {
            str = character[0] + str
        }
        return str
    }
    function leadingNulls(value, digits) {
        return leadingSomething(value, digits, "0")
    }
    function compareByDay(date1, date2) {
        function sgn(value) {
            return value < 0 ? -1 : value > 0 ? 1 : 0
        }
        var compare;
        if ((compare = sgn(date1.getFullYear() - date2.getFullYear())) === 0) {
            if ((compare = sgn(date1.getMonth() - date2.getMonth())) === 0) {
                compare = sgn(date1.getDate() - date2.getDate())
            }
        }
        return compare
    }
    function getFirstWeekStartDate(janFourth) {
        switch (janFourth.getDay()) {
        case 0:
            return new Date(janFourth.getFullYear() - 1,11,29);
        case 1:
            return janFourth;
        case 2:
            return new Date(janFourth.getFullYear(),0,3);
        case 3:
            return new Date(janFourth.getFullYear(),0,2);
        case 4:
            return new Date(janFourth.getFullYear(),0,1);
        case 5:
            return new Date(janFourth.getFullYear() - 1,11,31);
        case 6:
            return new Date(janFourth.getFullYear() - 1,11,30)
        }
    }
    function getWeekBasedYear(date) {
        var thisDate = __addDays(new Date(date.tm_year + 1900,0,1), date.tm_yday);
        var janFourthThisYear = new Date(thisDate.getFullYear(),0,4);
        var janFourthNextYear = new Date(thisDate.getFullYear() + 1,0,4);
        var firstWeekStartThisYear = getFirstWeekStartDate(janFourthThisYear);
        var firstWeekStartNextYear = getFirstWeekStartDate(janFourthNextYear);
        if (compareByDay(firstWeekStartThisYear, thisDate) <= 0) {
            if (compareByDay(firstWeekStartNextYear, thisDate) <= 0) {
                return thisDate.getFullYear() + 1
            } else {
                return thisDate.getFullYear()
            }
        } else {
            return thisDate.getFullYear() - 1
        }
    }
    var EXPANSION_RULES_2 = {
        "%a": function(date) {
            return WEEKDAYS[date.tm_wday].substring(0, 3)
        },
        "%A": function(date) {
            return WEEKDAYS[date.tm_wday]
        },
        "%b": function(date) {
            return MONTHS[date.tm_mon].substring(0, 3)
        },
        "%B": function(date) {
            return MONTHS[date.tm_mon]
        },
        "%C": function(date) {
            var year = date.tm_year + 1900;
            return leadingNulls(year / 100 | 0, 2)
        },
        "%d": function(date) {
            return leadingNulls(date.tm_mday, 2)
        },
        "%e": function(date) {
            return leadingSomething(date.tm_mday, 2, " ")
        },
        "%g": function(date) {
            return getWeekBasedYear(date).toString().substring(2)
        },
        "%G": function(date) {
            return getWeekBasedYear(date)
        },
        "%H": function(date) {
            return leadingNulls(date.tm_hour, 2)
        },
        "%I": function(date) {
            var twelveHour = date.tm_hour;
            if (twelveHour == 0)
                twelveHour = 12;
            else if (twelveHour > 12)
                twelveHour -= 12;
            return leadingNulls(twelveHour, 2)
        },
        "%j": function(date) {
            return leadingNulls(date.tm_mday + __arraySum(__isLeapYear(date.tm_year + 1900) ? __MONTH_DAYS_LEAP : __MONTH_DAYS_REGULAR, date.tm_mon - 1), 3)
        },
        "%m": function(date) {
            return leadingNulls(date.tm_mon + 1, 2)
        },
        "%M": function(date) {
            return leadingNulls(date.tm_min, 2)
        },
        "%n": function() {
            return "\n"
        },
        "%p": function(date) {
            if (date.tm_hour >= 0 && date.tm_hour < 12) {
                return "AM"
            } else {
                return "PM"
            }
        },
        "%S": function(date) {
            return leadingNulls(date.tm_sec, 2)
        },
        "%t": function() {
            return "\t"
        },
        "%u": function(date) {
            return date.tm_wday || 7
        },
        "%U": function(date) {
            var janFirst = new Date(date.tm_year + 1900,0,1);
            var firstSunday = janFirst.getDay() === 0 ? janFirst : __addDays(janFirst, 7 - janFirst.getDay());
            var endDate = new Date(date.tm_year + 1900,date.tm_mon,date.tm_mday);
            if (compareByDay(firstSunday, endDate) < 0) {
                var februaryFirstUntilEndMonth = __arraySum(__isLeapYear(endDate.getFullYear()) ? __MONTH_DAYS_LEAP : __MONTH_DAYS_REGULAR, endDate.getMonth() - 1) - 31;
                var firstSundayUntilEndJanuary = 31 - firstSunday.getDate();
                var days = firstSundayUntilEndJanuary + februaryFirstUntilEndMonth + endDate.getDate();
                return leadingNulls(Math.ceil(days / 7), 2)
            }
            return compareByDay(firstSunday, janFirst) === 0 ? "01" : "00"
        },
        "%V": function(date) {
            var janFourthThisYear = new Date(date.tm_year + 1900,0,4);
            var janFourthNextYear = new Date(date.tm_year + 1901,0,4);
            var firstWeekStartThisYear = getFirstWeekStartDate(janFourthThisYear);
            var firstWeekStartNextYear = getFirstWeekStartDate(janFourthNextYear);
            var endDate = __addDays(new Date(date.tm_year + 1900,0,1), date.tm_yday);
            if (compareByDay(endDate, firstWeekStartThisYear) < 0) {
                return "53"
            }
            if (compareByDay(firstWeekStartNextYear, endDate) <= 0) {
                return "01"
            }
            var daysDifference;
            if (firstWeekStartThisYear.getFullYear() < date.tm_year + 1900) {
                daysDifference = date.tm_yday + 32 - firstWeekStartThisYear.getDate()
            } else {
                daysDifference = date.tm_yday + 1 - firstWeekStartThisYear.getDate()
            }
            return leadingNulls(Math.ceil(daysDifference / 7), 2)
        },
        "%w": function(date) {
            return date.tm_wday
        },
        "%W": function(date) {
            var janFirst = new Date(date.tm_year,0,1);
            var firstMonday = janFirst.getDay() === 1 ? janFirst : __addDays(janFirst, janFirst.getDay() === 0 ? 1 : 7 - janFirst.getDay() + 1);
            var endDate = new Date(date.tm_year + 1900,date.tm_mon,date.tm_mday);
            if (compareByDay(firstMonday, endDate) < 0) {
                var februaryFirstUntilEndMonth = __arraySum(__isLeapYear(endDate.getFullYear()) ? __MONTH_DAYS_LEAP : __MONTH_DAYS_REGULAR, endDate.getMonth() - 1) - 31;
                var firstMondayUntilEndJanuary = 31 - firstMonday.getDate();
                var days = firstMondayUntilEndJanuary + februaryFirstUntilEndMonth + endDate.getDate();
                return leadingNulls(Math.ceil(days / 7), 2)
            }
            return compareByDay(firstMonday, janFirst) === 0 ? "01" : "00"
        },
        "%y": function(date) {
            return (date.tm_year + 1900).toString().substring(2)
        },
        "%Y": function(date) {
            return date.tm_year + 1900
        },
        "%z": function(date) {
            var off = date.tm_gmtoff;
            var ahead = off >= 0;
            off = Math.abs(off) / 60;
            off = off / 60 * 100 + off % 60;
            return (ahead ? "+" : "-") + String("0000" + off).slice(-4)
        },
        "%Z": function(date) {
            return date.tm_zone
        },
        "%%": function() {
            return "%"
        }
    };
    for (var rule in EXPANSION_RULES_2) {
        if (pattern.indexOf(rule) >= 0) {
            pattern = pattern.replace(new RegExp(rule,"g"), EXPANSION_RULES_2[rule](date))
        }
    }
    var bytes = intArrayFromString(pattern, false);
    if (bytes.length > maxsize) {
        return 0
    }
    writeArrayToMemory(bytes, s);
    return bytes.length - 1
}
function _sysconf(name) {
    switch (name) {
    case 30:
        return PAGE_SIZE;
    case 85:
        var maxHeapSize = 2 * 1024 * 1024 * 1024 - 65536;
        return maxHeapSize / PAGE_SIZE;
    case 132:
    case 133:
    case 12:
    case 137:
    case 138:
    case 15:
    case 235:
    case 16:
    case 17:
    case 18:
    case 19:
    case 20:
    case 149:
    case 13:
    case 10:
    case 236:
    case 153:
    case 9:
    case 21:
    case 22:
    case 159:
    case 154:
    case 14:
    case 77:
    case 78:
    case 139:
    case 80:
    case 81:
    case 82:
    case 68:
    case 67:
    case 164:
    case 11:
    case 29:
    case 47:
    case 48:
    case 95:
    case 52:
    case 51:
    case 46:
        return 200809;
    case 79:
        return 0;
    case 27:
    case 246:
    case 127:
    case 128:
    case 23:
    case 24:
    case 160:
    case 161:
    case 181:
    case 182:
    case 242:
    case 183:
    case 184:
    case 243:
    case 244:
    case 245:
    case 165:
    case 178:
    case 179:
    case 49:
    case 50:
    case 168:
    case 169:
    case 175:
    case 170:
    case 171:
    case 172:
    case 97:
    case 76:
    case 32:
    case 173:
    case 35:
        return -1;
    case 176:
    case 177:
    case 7:
    case 155:
    case 8:
    case 157:
    case 125:
    case 126:
    case 92:
    case 93:
    case 129:
    case 130:
    case 131:
    case 94:
    case 91:
        return 1;
    case 74:
    case 60:
    case 69:
    case 70:
    case 4:
        return 1024;
    case 31:
    case 42:
    case 72:
        return 32;
    case 87:
    case 26:
    case 33:
        return 2147483647;
    case 34:
    case 1:
        return 47839;
    case 38:
    case 36:
        return 99;
    case 43:
    case 37:
        return 2048;
    case 0:
        return 2097152;
    case 3:
        return 65536;
    case 28:
        return 32768;
    case 44:
        return 32767;
    case 75:
        return 16384;
    case 39:
        return 1e3;
    case 89:
        return 700;
    case 71:
        return 256;
    case 40:
        return 255;
    case 2:
        return 100;
    case 180:
        return 64;
    case 25:
        return 20;
    case 5:
        return 16;
    case 6:
        return 6;
    case 73:
        return 4;
    case 84:
        {
            if (typeof navigator === "object")
                return navigator["hardwareConcurrency"] || 1;
            return 1
        }
    }
    ___setErrNo(22);
    return -1
}
function _time(ptr) {
    var ret = Date.now() / 1e3 | 0;
    if (ptr) {
        HEAP32[ptr >> 2] = ret
    }
    return ret
}
function _unsetenv(name) {
    if (name === 0) {
        ___setErrNo(22);
        return -1
    }
    name = UTF8ToString(name);
    if (name === "" || name.indexOf("=") !== -1) {
        ___setErrNo(22);
        return -1
    }
    if (ENV.hasOwnProperty(name)) {
        delete ENV[name];
        ___buildEnvironment(__get_environ())
    }
    return 0
}
function _utime(path, times) {
    var time;
    if (times) {
        var offset = 4;
        time = HEAP32[times + offset >> 2];
        time *= 1e3
    } else {
        time = Date.now()
    }
    path = UTF8ToString(path);
    try {
        FS.utime(path, time, time);
        return 0
    } catch (e) {
        FS.handleFSError(e);
        return -1
    }
}
function _utimes(path, times) {
    var time;
    if (times) {
        var offset = 8 + 0;
        time = HEAP32[times + offset >> 2] * 1e3;
        offset = 8 + 4;
        time += HEAP32[times + offset >> 2] / 1e3
    } else {
        time = Date.now()
    }
    path = UTF8ToString(path);
    try {
        FS.utime(path, time, time);
        return 0
    } catch (e) {
        FS.handleFSError(e);
        return -1
    }
}
function _wait(stat_loc) {
    ___setErrNo(10);
    return -1
}
function _waitpid() {
    return _wait.apply(null, arguments)
}
if (ENVIRONMENT_IS_NODE) {
    _emscripten_get_now = function _emscripten_get_now_actual() {
        var t = process["hrtime"]();
        return t[0] * 1e3 + t[1] / 1e6
    }
} else if (typeof dateNow !== "undefined") {
    _emscripten_get_now = dateNow
} else if (typeof performance === "object" && performance && typeof performance["now"] === "function") {
    _emscripten_get_now = function() {
        return performance["now"]()
    }
} else {
    _emscripten_get_now = Date.now
}
FS.staticInit();
Module["FS_createPath"] = FS.createPath;
Module["FS_createDataFile"] = FS.createDataFile;
if (ENVIRONMENT_HAS_NODE) {
    var fs = require("fs");
    var NODEJS_PATH = require("path");
    NODEFS.staticInit()
}
Module["pump_message"] = MONO.pump_message;
BINDING.export_functions(Module);
function intArrayFromString(stringy, dontAddNull, length) {
    var len = length > 0 ? length : lengthBytesUTF8(stringy) + 1;
    var u8array = new Array(len);
    var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
    if (dontAddNull)
        u8array.length = numBytesWritten;
    return u8array
}
var asmGlobalArg = {};
var asmLibraryArg = {
    "l": ___assert_fail,
    "_a": ___buildEnvironment,
    "ma": ___clock_gettime,
    "Ja": ___cxa_allocate_exception,
    "Da": ___cxa_begin_catch,
    "Ca": ___cxa_end_catch,
    "Ga": ___cxa_find_matching_catch_3,
    "Ia": ___cxa_throw,
    "Ya": ___cxa_uncaught_exception,
    "v": ___lock,
    "Ba": ___resumeException,
    "pb": ___syscall10,
    "m": ___syscall102,
    "Eb": ___syscall118,
    "yb": ___syscall12,
    "ib": ___syscall122,
    "Q": ___syscall140,
    "bb": ___syscall142,
    "nb": ___syscall144,
    "cb": ___syscall145,
    "_": ___syscall146,
    "S": ___syscall15,
    "ab": ___syscall168,
    "Bb": ___syscall183,
    "ob": ___syscall192,
    "wb": ___syscall194,
    "T": ___syscall195,
    "ga": ___syscall196,
    "ia": ___syscall197,
    "$": ___syscall199,
    "sb": ___syscall20,
    "qb": ___syscall201,
    "tb": ___syscall202,
    "kb": ___syscall209,
    "da": ___syscall220,
    "h": ___syscall221,
    "la": ___syscall268,
    "ca": ___syscall272,
    "zb": ___syscall3,
    "ha": ___syscall320,
    "rb": ___syscall33,
    "eb": ___syscall38,
    "fa": ___syscall39,
    "Ab": ___syscall4,
    "Db": ___syscall40,
    "xb": ___syscall41,
    "Cb": ___syscall42,
    "R": ___syscall5,
    "O": ___syscall54,
    "C": ___syscall6,
    "ba": ___syscall63,
    "jb": ___syscall77,
    "ub": ___syscall85,
    "aa": ___syscall9,
    "mb": ___syscall91,
    "ja": ___syscall94,
    "gb": ___syscall96,
    "hb": ___syscall97,
    "q": ___unlock,
    "n": _abort,
    "sa": _clock_getres,
    "ra": _clock_gettime,
    "M": _emscripten_asm_const_iii,
    "Za": _emscripten_memcpy_big,
    "k": _exit,
    "H": _fabs,
    "N": _fabsf,
    "$a": _floor,
    "xa": _fork,
    "Fa": _getTempRet0,
    "qa": _getaddrinfo,
    "U": _getenv,
    "V": _getnameinfo,
    "pa": _getprotobyname,
    "W": _getpwuid,
    "p": _gettimeofday,
    "fb": _gmtime_r,
    "Ha": invoke_vi,
    "wa": _kill,
    "Ea": _llvm_eh_typeid_for,
    "g": _localtime_r,
    "Ka": _mono_set_timeout,
    "Na": _mono_wasm_add_array_item,
    "Va": _mono_wasm_add_array_var,
    "Ma": _mono_wasm_add_bool_var,
    "Oa": _mono_wasm_add_frame,
    "r": _mono_wasm_add_number_var,
    "Wa": _mono_wasm_add_obj_var,
    "P": _mono_wasm_add_properties_var,
    "L": _mono_wasm_add_string_var,
    "db": _mono_wasm_bind_core_object,
    "Xa": _mono_wasm_bind_host_object,
    "Pa": _mono_wasm_fire_bp,
    "za": _mono_wasm_get_by_index,
    "ea": _mono_wasm_get_global_object,
    "Aa": _mono_wasm_get_object_property,
    "Hb": _mono_wasm_invoke_js_marshalled,
    "Gb": _mono_wasm_invoke_js_unmarshalled,
    "La": _mono_wasm_invoke_js_with_args,
    "Ua": _mono_wasm_new,
    "lb": _mono_wasm_new_object,
    "Fb": _mono_wasm_release_handle,
    "vb": _mono_wasm_release_object,
    "ka": _mono_wasm_set_by_index,
    "ua": _mono_wasm_set_object_property,
    "Qa": _mono_wasm_typed_array_copy_from,
    "Sa": _mono_wasm_typed_array_copy_to,
    "Ra": _mono_wasm_typed_array_from,
    "Ta": _mono_wasm_typed_array_to_array,
    "D": _nanosleep,
    "i": _pthread_cleanup_pop,
    "j": _pthread_cleanup_push,
    "x": _pthread_cond_broadcast,
    "A": _pthread_cond_destroy,
    "o": _pthread_cond_init,
    "z": _pthread_cond_signal,
    "va": _pthread_cond_timedwait,
    "u": _pthread_cond_wait,
    "a": _pthread_mutexattr_destroy,
    "d": _pthread_mutexattr_init,
    "b": _pthread_mutexattr_setprotocol,
    "c": _pthread_mutexattr_settype,
    "B": _pthread_setcancelstate,
    "y": _sbrk,
    "ta": _schedule_background_exec,
    "F": _sem_destroy,
    "G": _sem_init,
    "E": _sem_post,
    "X": _sem_trywait,
    "I": _sem_wait,
    "oa": _setenv,
    "J": _sigaction,
    "K": _sigemptyset,
    "t": _sqrt,
    "w": _sqrtf,
    "f": _strftime,
    "s": _sysconf,
    "e": _time,
    "na": _unsetenv,
    "Z": _utime,
    "Y": _utimes,
    "ya": _waitpid
};
var asm = Module["asm"](asmGlobalArg, asmLibraryArg, buffer);
Module["asm"] = asm;
var ___wasm_call_ctors = Module["___wasm_call_ctors"] = function() {
    return Module["asm"]["Ib"].apply(null, arguments)
}
;
var _mono_wasm_add_assembly = Module["_mono_wasm_add_assembly"] = function() {
    return Module["asm"]["Jb"].apply(null, arguments)
}
;
var _malloc = Module["_malloc"] = function() {
    return Module["asm"]["Kb"].apply(null, arguments)
}
;
var _mono_wasm_setenv = Module["_mono_wasm_setenv"] = function() {
    return Module["asm"]["Lb"].apply(null, arguments)
}
;
var _free = Module["_free"] = function() {
    return Module["asm"]["Mb"].apply(null, arguments)
}
;
var _mono_wasm_load_runtime = Module["_mono_wasm_load_runtime"] = function() {
    return Module["asm"]["Nb"].apply(null, arguments)
}
;
var _mono_wasm_assembly_load = Module["_mono_wasm_assembly_load"] = function() {
    return Module["asm"]["Ob"].apply(null, arguments)
}
;
var _mono_wasm_assembly_find_class = Module["_mono_wasm_assembly_find_class"] = function() {
    return Module["asm"]["Pb"].apply(null, arguments)
}
;
var _mono_wasm_assembly_find_method = Module["_mono_wasm_assembly_find_method"] = function() {
    return Module["asm"]["Qb"].apply(null, arguments)
}
;
var _mono_wasm_invoke_method = Module["_mono_wasm_invoke_method"] = function() {
    return Module["asm"]["Rb"].apply(null, arguments)
}
;
var _mono_wasm_assembly_get_entry_point = Module["_mono_wasm_assembly_get_entry_point"] = function() {
    return Module["asm"]["Sb"].apply(null, arguments)
}
;
var _mono_wasm_string_get_utf8 = Module["_mono_wasm_string_get_utf8"] = function() {
    return Module["asm"]["Tb"].apply(null, arguments)
}
;
var _mono_wasm_string_from_js = Module["_mono_wasm_string_from_js"] = function() {
    return Module["asm"]["Ub"].apply(null, arguments)
}
;
var _mono_wasm_get_obj_type = Module["_mono_wasm_get_obj_type"] = function() {
    return Module["asm"]["Vb"].apply(null, arguments)
}
;
var _mono_unbox_int = Module["_mono_unbox_int"] = function() {
    return Module["asm"]["Wb"].apply(null, arguments)
}
;
var _mono_wasm_unbox_float = Module["_mono_wasm_unbox_float"] = function() {
    return Module["asm"]["Xb"].apply(null, arguments)
}
;
var _mono_wasm_array_length = Module["_mono_wasm_array_length"] = function() {
    return Module["asm"]["Yb"].apply(null, arguments)
}
;
var _mono_wasm_array_get = Module["_mono_wasm_array_get"] = function() {
    return Module["asm"]["Zb"].apply(null, arguments)
}
;
var _mono_wasm_obj_array_new = Module["_mono_wasm_obj_array_new"] = function() {
    return Module["asm"]["_b"].apply(null, arguments)
}
;
var _mono_wasm_obj_array_set = Module["_mono_wasm_obj_array_set"] = function() {
    return Module["asm"]["$b"].apply(null, arguments)
}
;
var _mono_wasm_string_array_new = Module["_mono_wasm_string_array_new"] = function() {
    return Module["asm"]["ac"].apply(null, arguments)
}
;
var _mono_wasm_exec_regression = Module["_mono_wasm_exec_regression"] = function() {
    return Module["asm"]["bc"].apply(null, arguments)
}
;
var _mono_wasm_exit = Module["_mono_wasm_exit"] = function() {
    return Module["asm"]["cc"].apply(null, arguments)
}
;
var _mono_wasm_set_main_args = Module["_mono_wasm_set_main_args"] = function() {
    return Module["asm"]["dc"].apply(null, arguments)
}
;
var _mono_wasm_strdup = Module["_mono_wasm_strdup"] = function() {
    return Module["asm"]["ec"].apply(null, arguments)
}
;
var _mono_wasm_parse_runtime_options = Module["_mono_wasm_parse_runtime_options"] = function() {
    return Module["asm"]["fc"].apply(null, arguments)
}
;
var _mono_wasm_enable_on_demand_gc = Module["_mono_wasm_enable_on_demand_gc"] = function() {
    return Module["asm"]["gc"].apply(null, arguments)
}
;
var _mono_wasm_typed_array_new = Module["_mono_wasm_typed_array_new"] = function() {
    return Module["asm"]["hc"].apply(null, arguments)
}
;
var _mono_wasm_unbox_enum = Module["_mono_wasm_unbox_enum"] = function() {
    return Module["asm"]["ic"].apply(null, arguments)
}
;
var ___errno_location = Module["___errno_location"] = function() {
    return Module["asm"]["jc"].apply(null, arguments)
}
;
var _mono_print_method_from_ip = Module["_mono_print_method_from_ip"] = function() {
    return Module["asm"]["kc"].apply(null, arguments)
}
;
var _putchar = Module["_putchar"] = function() {
    return Module["asm"]["lc"].apply(null, arguments)
}
;
var _mono_wasm_setup_single_step = Module["_mono_wasm_setup_single_step"] = function() {
    return Module["asm"]["mc"].apply(null, arguments)
}
;
var _mono_wasm_clear_all_breakpoints = Module["_mono_wasm_clear_all_breakpoints"] = function() {
    return Module["asm"]["nc"].apply(null, arguments)
}
;
var _mono_wasm_set_breakpoint = Module["_mono_wasm_set_breakpoint"] = function() {
    return Module["asm"]["oc"].apply(null, arguments)
}
;
var _mono_wasm_remove_breakpoint = Module["_mono_wasm_remove_breakpoint"] = function() {
    return Module["asm"]["pc"].apply(null, arguments)
}
;
var _mono_wasm_current_bp_id = Module["_mono_wasm_current_bp_id"] = function() {
    return Module["asm"]["qc"].apply(null, arguments)
}
;
var _mono_wasm_enum_frames = Module["_mono_wasm_enum_frames"] = function() {
    return Module["asm"]["rc"].apply(null, arguments)
}
;
var _mono_wasm_get_var_info = Module["_mono_wasm_get_var_info"] = function() {
    return Module["asm"]["sc"].apply(null, arguments)
}
;
var _mono_wasm_get_object_properties = Module["_mono_wasm_get_object_properties"] = function() {
    return Module["asm"]["tc"].apply(null, arguments)
}
;
var _mono_wasm_get_array_values = Module["_mono_wasm_get_array_values"] = function() {
    return Module["asm"]["uc"].apply(null, arguments)
}
;
var _mono_set_timeout_exec = Module["_mono_set_timeout_exec"] = function() {
    return Module["asm"]["vc"].apply(null, arguments)
}
;
var _htonl = Module["_htonl"] = function() {
    return Module["asm"]["wc"].apply(null, arguments)
}
;
var _htons = Module["_htons"] = function() {
    return Module["asm"]["xc"].apply(null, arguments)
}
;
var _ntohs = Module["_ntohs"] = function() {
    return Module["asm"]["yc"].apply(null, arguments)
}
;
var _mono_background_exec = Module["_mono_background_exec"] = function() {
    return Module["asm"]["zc"].apply(null, arguments)
}
;
var __ZSt18uncaught_exceptionv = Module["__ZSt18uncaught_exceptionv"] = function() {
    return Module["asm"]["Ac"].apply(null, arguments)
}
;
var ___cxa_can_catch = Module["___cxa_can_catch"] = function() {
    return Module["asm"]["Bc"].apply(null, arguments)
}
;
var ___cxa_is_pointer_type = Module["___cxa_is_pointer_type"] = function() {
    return Module["asm"]["Cc"].apply(null, arguments)
}
;
var __get_tzname = Module["__get_tzname"] = function() {
    return Module["asm"]["Dc"].apply(null, arguments)
}
;
var __get_daylight = Module["__get_daylight"] = function() {
    return Module["asm"]["Ec"].apply(null, arguments)
}
;
var __get_timezone = Module["__get_timezone"] = function() {
    return Module["asm"]["Fc"].apply(null, arguments)
}
;
var __get_environ = Module["__get_environ"] = function() {
    return Module["asm"]["Gc"].apply(null, arguments)
}
;
var _memalign = Module["_memalign"] = function() {
    return Module["asm"]["Hc"].apply(null, arguments)
}
;
var _setThrew = Module["_setThrew"] = function() {
    return Module["asm"]["Ic"].apply(null, arguments)
}
;
var dynCall_vi = Module["dynCall_vi"] = function() {
    return Module["asm"]["Jc"].apply(null, arguments)
}
;
var stackSave = Module["stackSave"] = function() {
    return Module["asm"]["Kc"].apply(null, arguments)
}
;
var stackAlloc = Module["stackAlloc"] = function() {
    return Module["asm"]["Lc"].apply(null, arguments)
}
;
var stackRestore = Module["stackRestore"] = function() {
    return Module["asm"]["Mc"].apply(null, arguments)
}
;
var dynCall_ii = Module["dynCall_ii"] = function() {
    return Module["asm"]["Nc"].apply(null, arguments)
}
;
var dynCall_v = Module["dynCall_v"] = function() {
    return Module["asm"]["Oc"].apply(null, arguments)
}
;
function invoke_vi(index, a1) {
    var sp = stackSave();
    try {
        dynCall_vi(index, a1)
    } catch (e) {
        stackRestore(sp);
        if (e !== e + 0 && e !== "longjmp")
            throw e;
        _setThrew(1, 0)
    }
}
Module["asm"] = asm;
Module["ccall"] = ccall;
Module["cwrap"] = cwrap;
Module["setValue"] = setValue;
Module["getValue"] = getValue;
Module["UTF8ToString"] = UTF8ToString;
Module["FS_createPath"] = FS.createPath;
Module["FS_createDataFile"] = FS.createDataFile;
Module["addFunction"] = addFunction;
function ExitStatus(status) {
    this.name = "ExitStatus";
    this.message = "Program terminated with exit(" + status + ")";
    this.status = status
}
ExitStatus.prototype = new Error;
ExitStatus.prototype.constructor = ExitStatus;
dependenciesFulfilled = function runCaller() {
    if (!Module["calledRun"])
        run();
    if (!Module["calledRun"])
        dependenciesFulfilled = runCaller
}
;
function run(args) {
    args = args || Module["arguments"];
    if (runDependencies > 0) {
        return
    }
    preRun();
    if (runDependencies > 0)
        return;
    if (Module["calledRun"])
        return;
    function doRun() {
        if (Module["calledRun"])
            return;
        Module["calledRun"] = true;
        if (ABORT)
            return;
        initRuntime();
        preMain();
        if (Module["onRuntimeInitialized"])
            Module["onRuntimeInitialized"]();
        postRun()
    }
    if (Module["setStatus"]) {
        Module["setStatus"]("Running...");
        setTimeout(function() {
            setTimeout(function() {
                Module["setStatus"]("")
            }, 1);
            doRun()
        }, 1)
    } else {
        doRun()
    }
}
Module["run"] = run;
function exit(status, implicit) {
    if (implicit && Module["noExitRuntime"] && status === 0) {
        return
    }
    if (Module["noExitRuntime"]) {} else {
        ABORT = true;
        EXITSTATUS = status;
        exitRuntime();
        if (Module["onExit"])
            Module["onExit"](status)
    }
    Module["quit"](status, new ExitStatus(status))
}
function abort(what) {
    if (Module["onAbort"]) {
        Module["onAbort"](what)
    }
    if (what !== undefined) {
        out(what);
        err(what);
        what = '"' + what + '"'
    } else {
        what = ""
    }
    ABORT = true;
    EXITSTATUS = 1;
    throw "abort(" + what + "). Build with -s ASSERTIONS=1 for more info."
}
Module["abort"] = abort;
if (Module["preInit"]) {
    if (typeof Module["preInit"] == "function")
        Module["preInit"] = [Module["preInit"]];
    while (Module["preInit"].length > 0) {
        Module["preInit"].pop()()
    }
}
Module["noExitRuntime"] = true;
run();

// SIG // Begin signature block
// SIG // MIIjhAYJKoZIhvcNAQcCoIIjdTCCI3ECAQExDzANBglg
// SIG // hkgBZQMEAgEFADB3BgorBgEEAYI3AgEEoGkwZzAyBgor
// SIG // BgEEAYI3AgEeMCQCAQEEEBDgyQbOONQRoqMAEEvTUJAC
// SIG // AQACAQACAQACAQACAQAwMTANBglghkgBZQMEAgEFAAQg
// SIG // R6iCQZBrwAQ00PmdkLL2f15LKFvabOGzfC3UcuPZVtWg
// SIG // gg2BMIIF/zCCA+egAwIBAgITMwAAAVGejY9AcaMOQQAA
// SIG // AAABUTANBgkqhkiG9w0BAQsFADB+MQswCQYDVQQGEwJV
// SIG // UzETMBEGA1UECBMKV2FzaGluZ3RvbjEQMA4GA1UEBxMH
// SIG // UmVkbW9uZDEeMBwGA1UEChMVTWljcm9zb2Z0IENvcnBv
// SIG // cmF0aW9uMSgwJgYDVQQDEx9NaWNyb3NvZnQgQ29kZSBT
// SIG // aWduaW5nIFBDQSAyMDExMB4XDTE5MDUwMjIxMzc0NloX
// SIG // DTIwMDUwMjIxMzc0NlowdDELMAkGA1UEBhMCVVMxEzAR
// SIG // BgNVBAgTCldhc2hpbmd0b24xEDAOBgNVBAcTB1JlZG1v
// SIG // bmQxHjAcBgNVBAoTFU1pY3Jvc29mdCBDb3Jwb3JhdGlv
// SIG // bjEeMBwGA1UEAxMVTWljcm9zb2Z0IENvcnBvcmF0aW9u
// SIG // MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA
// SIG // lVrGhmlHHTQe8VXDZnX2YlQYWBRnJ/CjKsYDSLzmVjR/
// SIG // SWEC7oR4ZieUViEstaHst807sai25BwHZm3lPDRTKOPT
// SIG // 7+9TICEvSBvxLasDh+7qWp/pSKujTnMOXzujrPtdkdEN
// SIG // vDMxp/t8uxdpig56KVbtLBLn8uOd4Mc9ejPGwMOPkF7r
// SIG // +/n0fVs0SdgqVOtsECmIhUDH3sOlYeX7j6F5aDd5OvkJ
// SIG // c+84HE+GEZsc8e4zFaT/7ryurGXAcUN1oAf1pMlx4MWm
// SIG // NfSAMy6tkIj4l9mK8okeRLGAat+QT+1NeQ5WbaUrNsCG
// SIG // E5JAwcYTySAyYKMGbuRsoR3aq7Ldzo5EkQIDAQABo4IB
// SIG // fjCCAXowHwYDVR0lBBgwFgYKKwYBBAGCN0wIAQYIKwYB
// SIG // BQUHAwMwHQYDVR0OBBYEFFeCGq5Kue3rGoLuhVAW9u9G
// SIG // Yo3PMFAGA1UdEQRJMEekRTBDMSkwJwYDVQQLEyBNaWNy
// SIG // b3NvZnQgT3BlcmF0aW9ucyBQdWVydG8gUmljbzEWMBQG
// SIG // A1UEBRMNMjMwMDEyKzQ1NDEzNTAfBgNVHSMEGDAWgBRI
// SIG // bmTlUAXTgqoXNzcitW2oynUClTBUBgNVHR8ETTBLMEmg
// SIG // R6BFhkNodHRwOi8vd3d3Lm1pY3Jvc29mdC5jb20vcGtp
// SIG // b3BzL2NybC9NaWNDb2RTaWdQQ0EyMDExXzIwMTEtMDct
// SIG // MDguY3JsMGEGCCsGAQUFBwEBBFUwUzBRBggrBgEFBQcw
// SIG // AoZFaHR0cDovL3d3dy5taWNyb3NvZnQuY29tL3BraW9w
// SIG // cy9jZXJ0cy9NaWNDb2RTaWdQQ0EyMDExXzIwMTEtMDct
// SIG // MDguY3J0MAwGA1UdEwEB/wQCMAAwDQYJKoZIhvcNAQEL
// SIG // BQADggIBAFoPgK0uAJ6uyq6ILJSEJ6DB0l1D6/0ajiIS
// SIG // V/t9jm7mNzBb3ZURJW0rEica0cvzggmXUrHvn9gKkPhf
// SIG // 9mmMAQ5lEG3jAfJ9KWC2Zzj4n6nu/EQR9n1WbL18cn4s
// SIG // 2x7m1lqFHzVvxSZWZS18CZhdwaC/BNqdPSt4WoMM/6LX
// SIG // CrUNfkOPg2jmF1pXqiayVLJx7PVIi3K1RdJXi/0NVeW7
// SIG // IaG9jk5WatKs0nazAy1nYcq1DsZ2fqI2e1HU2OFZwrqI
// SIG // G2fWbPbMiW4O2VEvUlYGJKMEbFr+Y1eJW6kw/rRuBc4T
// SIG // sHEUMHW+gPM6djZ3frO1XQrmBbBoCONbnA/KMVX3ADIx
// SIG // fWF+TdrOJpbZKp1Ht/4bVa58SigwMEmJYmrsdi+4CsPm
// SIG // w9ZBGf+aMy0Zyd44w5KJk6z3LaJGPymmdarm9DVJ5jih
// SIG // /t8VCv6ZViSvATkGLlO4CmB+2MvVkijZT+6So+ouNe/t
// SIG // zWv36yJ45wZCkQif3mE7wR/rOYLns6X0FrVOGzaP4/EM
// SIG // Nr6U0PcO35YR+/EZsHd9ffmE5ob+03MQ21pcrXmo+ESt
// SIG // sJN6WNaEs9iTxOTzbjZnfRpn+qHj2YMuyIvSSy6vEp1C
// SIG // 1e2/iD9FF0WPavhnUYzNgBF+prGb7zwiKBtGmB0LvcGb
// SIG // ChCto6r1ovP8XXnnkiPRTeitcOKFUDODMIIHejCCBWKg
// SIG // AwIBAgIKYQ6Q0gAAAAAAAzANBgkqhkiG9w0BAQsFADCB
// SIG // iDELMAkGA1UEBhMCVVMxEzARBgNVBAgTCldhc2hpbmd0
// SIG // b24xEDAOBgNVBAcTB1JlZG1vbmQxHjAcBgNVBAoTFU1p
// SIG // Y3Jvc29mdCBDb3Jwb3JhdGlvbjEyMDAGA1UEAxMpTWlj
// SIG // cm9zb2Z0IFJvb3QgQ2VydGlmaWNhdGUgQXV0aG9yaXR5
// SIG // IDIwMTEwHhcNMTEwNzA4MjA1OTA5WhcNMjYwNzA4MjEw
// SIG // OTA5WjB+MQswCQYDVQQGEwJVUzETMBEGA1UECBMKV2Fz
// SIG // aGluZ3RvbjEQMA4GA1UEBxMHUmVkbW9uZDEeMBwGA1UE
// SIG // ChMVTWljcm9zb2Z0IENvcnBvcmF0aW9uMSgwJgYDVQQD
// SIG // Ex9NaWNyb3NvZnQgQ29kZSBTaWduaW5nIFBDQSAyMDEx
// SIG // MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEA
// SIG // q/D6chAcLq3YbqqCEE00uvK2WCGfQhsqa+laUKq4Bjga
// SIG // BEm6f8MMHt03a8YS2AvwOMKZBrDIOdUBFDFC04kNeWSH
// SIG // fpRgJGyvnkmc6Whe0t+bU7IKLMOv2akrrnoJr9eWWcpg
// SIG // GgXpZnboMlImEi/nqwhQz7NEt13YxC4Ddato88tt8zpc
// SIG // oRb0RrrgOGSsbmQ1eKagYw8t00CT+OPeBw3VXHmlSSnn
// SIG // Db6gE3e+lD3v++MrWhAfTVYoonpy4BI6t0le2O3tQ5GD
// SIG // 2Xuye4Yb2T6xjF3oiU+EGvKhL1nkkDstrjNYxbc+/jLT
// SIG // swM9sbKvkjh+0p2ALPVOVpEhNSXDOW5kf1O6nA+tGSOE
// SIG // y/S6A4aN91/w0FK/jJSHvMAhdCVfGCi2zCcoOCWYOUo2
// SIG // z3yxkq4cI6epZuxhH2rhKEmdX4jiJV3TIUs+UsS1Vz8k
// SIG // A/DRelsv1SPjcF0PUUZ3s/gA4bysAoJf28AVs70b1FVL
// SIG // 5zmhD+kjSbwYuER8ReTBw3J64HLnJN+/RpnF78IcV9uD
// SIG // jexNSTCnq47f7Fufr/zdsGbiwZeBe+3W7UvnSSmnEyim
// SIG // p31ngOaKYnhfsi+E11ecXL93KCjx7W3DKI8sj0A3T8Hh
// SIG // hUSJxAlMxdSlQy90lfdu+HggWCwTXWCVmj5PM4TasIgX
// SIG // 3p5O9JawvEagbJjS4NaIjAsCAwEAAaOCAe0wggHpMBAG
// SIG // CSsGAQQBgjcVAQQDAgEAMB0GA1UdDgQWBBRIbmTlUAXT
// SIG // gqoXNzcitW2oynUClTAZBgkrBgEEAYI3FAIEDB4KAFMA
// SIG // dQBiAEMAQTALBgNVHQ8EBAMCAYYwDwYDVR0TAQH/BAUw
// SIG // AwEB/zAfBgNVHSMEGDAWgBRyLToCMZBDuRQFTuHqp8cx
// SIG // 0SOJNDBaBgNVHR8EUzBRME+gTaBLhklodHRwOi8vY3Js
// SIG // Lm1pY3Jvc29mdC5jb20vcGtpL2NybC9wcm9kdWN0cy9N
// SIG // aWNSb29DZXJBdXQyMDExXzIwMTFfMDNfMjIuY3JsMF4G
// SIG // CCsGAQUFBwEBBFIwUDBOBggrBgEFBQcwAoZCaHR0cDov
// SIG // L3d3dy5taWNyb3NvZnQuY29tL3BraS9jZXJ0cy9NaWNS
// SIG // b29DZXJBdXQyMDExXzIwMTFfMDNfMjIuY3J0MIGfBgNV
// SIG // HSAEgZcwgZQwgZEGCSsGAQQBgjcuAzCBgzA/BggrBgEF
// SIG // BQcCARYzaHR0cDovL3d3dy5taWNyb3NvZnQuY29tL3Br
// SIG // aW9wcy9kb2NzL3ByaW1hcnljcHMuaHRtMEAGCCsGAQUF
// SIG // BwICMDQeMiAdAEwAZQBnAGEAbABfAHAAbwBsAGkAYwB5
// SIG // AF8AcwB0AGEAdABlAG0AZQBuAHQALiAdMA0GCSqGSIb3
// SIG // DQEBCwUAA4ICAQBn8oalmOBUeRou09h0ZyKbC5YR4WOS
// SIG // mUKWfdJ5DJDBZV8uLD74w3LRbYP+vj/oCso7v0epo/Np
// SIG // 22O/IjWll11lhJB9i0ZQVdgMknzSGksc8zxCi1LQsP1r
// SIG // 4z4HLimb5j0bpdS1HXeUOeLpZMlEPXh6I/MTfaaQdION
// SIG // 9MsmAkYqwooQu6SpBQyb7Wj6aC6VoCo/KmtYSWMfCWlu
// SIG // WpiW5IP0wI/zRive/DvQvTXvbiWu5a8n7dDd8w6vmSiX
// SIG // mE0OPQvyCInWH8MyGOLwxS3OW560STkKxgrCxq2u5bLZ
// SIG // 2xWIUUVYODJxJxp/sfQn+N4sOiBpmLJZiWhub6e3dMNA
// SIG // BQamASooPoI/E01mC8CzTfXhj38cbxV9Rad25UAqZaPD
// SIG // XVJihsMdYzaXht/a8/jyFqGaJ+HNpZfQ7l1jQeNbB5yH
// SIG // PgZ3BtEGsXUfFL5hYbXw3MYbBL7fQccOKO7eZS/sl/ah
// SIG // XJbYANahRr1Z85elCUtIEJmAH9AAKcWxm6U/RXceNcbS
// SIG // oqKfenoi+kiVH6v7RyOA9Z74v2u3S5fi63V4GuzqN5l5
// SIG // GEv/1rMjaHXmr/r8i+sLgOppO6/8MO0ETI7f33VtY5E9
// SIG // 0Z1WTk+/gFcioXgRMiF670EKsT/7qMykXcGhiJtXcVZO
// SIG // SEXAQsmbdlsKgEhr/Xmfwb1tbWrJUnMTDXpQzTGCFVsw
// SIG // ghVXAgEBMIGVMH4xCzAJBgNVBAYTAlVTMRMwEQYDVQQI
// SIG // EwpXYXNoaW5ndG9uMRAwDgYDVQQHEwdSZWRtb25kMR4w
// SIG // HAYDVQQKExVNaWNyb3NvZnQgQ29ycG9yYXRpb24xKDAm
// SIG // BgNVBAMTH01pY3Jvc29mdCBDb2RlIFNpZ25pbmcgUENB
// SIG // IDIwMTECEzMAAAFRno2PQHGjDkEAAAAAAVEwDQYJYIZI
// SIG // AWUDBAIBBQCgga4wGQYJKoZIhvcNAQkDMQwGCisGAQQB
// SIG // gjcCAQQwHAYKKwYBBAGCNwIBCzEOMAwGCisGAQQBgjcC
// SIG // ARUwLwYJKoZIhvcNAQkEMSIEINR/M7GVfQY/FTBTUo+6
// SIG // TY8qazDiFchiYK2ZmHd5hqAYMEIGCisGAQQBgjcCAQwx
// SIG // NDAyoBSAEgBNAGkAYwByAG8AcwBvAGYAdKEagBhodHRw
// SIG // Oi8vd3d3Lm1pY3Jvc29mdC5jb20wDQYJKoZIhvcNAQEB
// SIG // BQAEggEAg4DMb7HWmADOEwY25bB0DCGEjRGg4U20lbNy
// SIG // 8eTxWvAj93LA1lBQUW6nECJSLzaZD2YLOvjEF+Z55a+S
// SIG // aFquh0YLNRY+9+Dy34qtjNjsbWA+IIfiFHgmQ/IakGN+
// SIG // ZkWAMTlAULFu1aHxU73ARvi6ERqwct5AeAkvwEnp1LK3
// SIG // KwdFtP+MBj6S4XNLlow/bwznOSBJqxl08PtDaEZni+Ui
// SIG // dEfLFIBEPQkRjojeDCQJhMS/X8qTzy02djPkUQGivSRe
// SIG // zAwOWePddSI21LCHVwrs9XY0m/R3mu0Jhk4rfXMcRiMo
// SIG // IuIEbFpNIOUgd/K4tKATtdW804/rU3qwQlSIEZ8+fqGC
// SIG // EuUwghLhBgorBgEEAYI3AwMBMYIS0TCCEs0GCSqGSIb3
// SIG // DQEHAqCCEr4wghK6AgEDMQ8wDQYJYIZIAWUDBAIBBQAw
// SIG // ggFRBgsqhkiG9w0BCRABBKCCAUAEggE8MIIBOAIBAQYK
// SIG // KwYBBAGEWQoDATAxMA0GCWCGSAFlAwQCAQUABCCS2fFS
// SIG // vG7c3/RkK7SEgh7diPLAv+Ls98DczlE99a8g7AIGXV1y
// SIG // +0dqGBMyMDE5MDkxMjIzMDgyMi40NDRaMASAAgH0oIHQ
// SIG // pIHNMIHKMQswCQYDVQQGEwJVUzETMBEGA1UECBMKV2Fz
// SIG // aGluZ3RvbjEQMA4GA1UEBxMHUmVkbW9uZDEeMBwGA1UE
// SIG // ChMVTWljcm9zb2Z0IENvcnBvcmF0aW9uMSUwIwYDVQQL
// SIG // ExxNaWNyb3NvZnQgQW1lcmljYSBPcGVyYXRpb25zMSYw
// SIG // JAYDVQQLEx1UaGFsZXMgVFNTIEVTTjpEMkNELUUzMTAt
// SIG // NEFGMTElMCMGA1UEAxMcTWljcm9zb2Z0IFRpbWUtU3Rh
// SIG // bXAgU2VydmljZaCCDjwwggTxMIID2aADAgECAhMzAAAA
// SIG // +dMLshkBGsEtAAAAAAD5MA0GCSqGSIb3DQEBCwUAMHwx
// SIG // CzAJBgNVBAYTAlVTMRMwEQYDVQQIEwpXYXNoaW5ndG9u
// SIG // MRAwDgYDVQQHEwdSZWRtb25kMR4wHAYDVQQKExVNaWNy
// SIG // b3NvZnQgQ29ycG9yYXRpb24xJjAkBgNVBAMTHU1pY3Jv
// SIG // c29mdCBUaW1lLVN0YW1wIFBDQSAyMDEwMB4XDTE4MTAy
// SIG // NDIxMTQyOVoXDTIwMDExMDIxMTQyOVowgcoxCzAJBgNV
// SIG // BAYTAlVTMRMwEQYDVQQIEwpXYXNoaW5ndG9uMRAwDgYD
// SIG // VQQHEwdSZWRtb25kMR4wHAYDVQQKExVNaWNyb3NvZnQg
// SIG // Q29ycG9yYXRpb24xJTAjBgNVBAsTHE1pY3Jvc29mdCBB
// SIG // bWVyaWNhIE9wZXJhdGlvbnMxJjAkBgNVBAsTHVRoYWxl
// SIG // cyBUU1MgRVNOOkQyQ0QtRTMxMC00QUYxMSUwIwYDVQQD
// SIG // ExxNaWNyb3NvZnQgVGltZS1TdGFtcCBTZXJ2aWNlMIIB
// SIG // IjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArefR
// SIG // eEwpmSjvp3/Smc15XU+WrXSa2IroXcxOUQu5rqGYry++
// SIG // hZLVi3I0NV5tbotUj9UqFCVlEofJTK3IUYlgCRkbuUGL
// SIG // qgXr73xFvIivxTXc7tb57COXMWwLKDwasEo97hzAekYc
// SIG // qL7ZeT4KD+VYGKpPemIzemGpUg83c0ndccVsaRxpQOuQ
// SIG // BSxkMxXpzzntqOo++muKBJys8+BG/8dhzbOoh0M1Ty5P
// SIG // 2gtKNQEGt7AX38CaQ34WLTW8IKcXpRlDAddEm6ZQOp79
// SIG // ELxNDYISeV8ap0bMtrZiA8wPwp/d8Pipp6xGQIKvqIWA
// SIG // hq9ivBhjCqPkvTSvgKx+AuU8u5xIoQIDAQABo4IBGzCC
// SIG // ARcwHQYDVR0OBBYEFI6q0UsGLCrWWp5BT9D7PpP6JsED
// SIG // MB8GA1UdIwQYMBaAFNVjOlyKMZDzQ3t8RhvFM2hahW1V
// SIG // MFYGA1UdHwRPME0wS6BJoEeGRWh0dHA6Ly9jcmwubWlj
// SIG // cm9zb2Z0LmNvbS9wa2kvY3JsL3Byb2R1Y3RzL01pY1Rp
// SIG // bVN0YVBDQV8yMDEwLTA3LTAxLmNybDBaBggrBgEFBQcB
// SIG // AQROMEwwSgYIKwYBBQUHMAKGPmh0dHA6Ly93d3cubWlj
// SIG // cm9zb2Z0LmNvbS9wa2kvY2VydHMvTWljVGltU3RhUENB
// SIG // XzIwMTAtMDctMDEuY3J0MAwGA1UdEwEB/wQCMAAwEwYD
// SIG // VR0lBAwwCgYIKwYBBQUHAwgwDQYJKoZIhvcNAQELBQAD
// SIG // ggEBAGWmm+6VO5vOzedfuE9NRRApVygU5i8AooXrpd/q
// SIG // cxEsHud0lLN3hzfXRazz/jm+w42/ocnCl85dZU6Y7fZ0
// SIG // SlJwFfjckX2YXhg6+Lp48pREKmDermTQks8ywocDjOIy
// SIG // 8eH20+CvMsFCiH03z1o/Fv4mOjXt5rWpqpWSY/g3pLgI
// SIG // FHVEgFdBm4Q7vqnQcM/WnyToY0wbSo+n78ZpvuI2pWSu
// SIG // lLEhcdsxdWkNt7fxA/HQK7kzv7CRCdHp9uQLjcx+yYeL
// SIG // rpTVm6AsguA+enGhskYIJPNiKcYjd9fmVS8uGs2bv//E
// SIG // JFnx6hYX2WtKndlWhbmVONzx0PiFIfCgjg9120kwggZx
// SIG // MIIEWaADAgECAgphCYEqAAAAAAACMA0GCSqGSIb3DQEB
// SIG // CwUAMIGIMQswCQYDVQQGEwJVUzETMBEGA1UECBMKV2Fz
// SIG // aGluZ3RvbjEQMA4GA1UEBxMHUmVkbW9uZDEeMBwGA1UE
// SIG // ChMVTWljcm9zb2Z0IENvcnBvcmF0aW9uMTIwMAYDVQQD
// SIG // EylNaWNyb3NvZnQgUm9vdCBDZXJ0aWZpY2F0ZSBBdXRo
// SIG // b3JpdHkgMjAxMDAeFw0xMDA3MDEyMTM2NTVaFw0yNTA3
// SIG // MDEyMTQ2NTVaMHwxCzAJBgNVBAYTAlVTMRMwEQYDVQQI
// SIG // EwpXYXNoaW5ndG9uMRAwDgYDVQQHEwdSZWRtb25kMR4w
// SIG // HAYDVQQKExVNaWNyb3NvZnQgQ29ycG9yYXRpb24xJjAk
// SIG // BgNVBAMTHU1pY3Jvc29mdCBUaW1lLVN0YW1wIFBDQSAy
// SIG // MDEwMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKC
// SIG // AQEAqR0NvHcRijog7PwTl/X6f2mUa3RUENWlCgCChfvt
// SIG // fGhLLF/Fw+Vhwna3PmYrW/AVUycEMR9BGxqVHc4JE458
// SIG // YTBZsTBED/FgiIRUQwzXTbg4CLNC3ZOs1nMwVyaCo0UN
// SIG // 0Or1R4HNvyRgMlhgRvJYR4YyhB50YWeRX4FUsc+TTJLB
// SIG // xKZd0WETbijGGvmGgLvfYfxGwScdJGcSchohiq9LZIlQ
// SIG // YrFd/XcfPfBXday9ikJNQFHRD5wGPmd/9WbAA5ZEfu/Q
// SIG // S/1u5ZrKsajyeioKMfDaTgaRtogINeh4HLDpmc085y9E
// SIG // uqf03GS9pAHBIAmTeM38vMDJRF1eFpwBBU8iTQIDAQAB
// SIG // o4IB5jCCAeIwEAYJKwYBBAGCNxUBBAMCAQAwHQYDVR0O
// SIG // BBYEFNVjOlyKMZDzQ3t8RhvFM2hahW1VMBkGCSsGAQQB
// SIG // gjcUAgQMHgoAUwB1AGIAQwBBMAsGA1UdDwQEAwIBhjAP
// SIG // BgNVHRMBAf8EBTADAQH/MB8GA1UdIwQYMBaAFNX2VsuP
// SIG // 6KJcYmjRPZSQW9fOmhjEMFYGA1UdHwRPME0wS6BJoEeG
// SIG // RWh0dHA6Ly9jcmwubWljcm9zb2Z0LmNvbS9wa2kvY3Js
// SIG // L3Byb2R1Y3RzL01pY1Jvb0NlckF1dF8yMDEwLTA2LTIz
// SIG // LmNybDBaBggrBgEFBQcBAQROMEwwSgYIKwYBBQUHMAKG
// SIG // Pmh0dHA6Ly93d3cubWljcm9zb2Z0LmNvbS9wa2kvY2Vy
// SIG // dHMvTWljUm9vQ2VyQXV0XzIwMTAtMDYtMjMuY3J0MIGg
// SIG // BgNVHSABAf8EgZUwgZIwgY8GCSsGAQQBgjcuAzCBgTA9
// SIG // BggrBgEFBQcCARYxaHR0cDovL3d3dy5taWNyb3NvZnQu
// SIG // Y29tL1BLSS9kb2NzL0NQUy9kZWZhdWx0Lmh0bTBABggr
// SIG // BgEFBQcCAjA0HjIgHQBMAGUAZwBhAGwAXwBQAG8AbABp
// SIG // AGMAeQBfAFMAdABhAHQAZQBtAGUAbgB0AC4gHTANBgkq
// SIG // hkiG9w0BAQsFAAOCAgEAB+aIUQ3ixuCYP4FxAz2do6Eh
// SIG // b7Prpsz1Mb7PBeKp/vpXbRkws8LFZslq3/Xn8Hi9x6ie
// SIG // JeP5vO1rVFcIK1GCRBL7uVOMzPRgEop2zEBAQZvcXBf/
// SIG // XPleFzWYJFZLdO9CEMivv3/Gf/I3fVo/HPKZeUqRUgCv
// SIG // OA8X9S95gWXZqbVr5MfO9sp6AG9LMEQkIjzP7QOllo9Z
// SIG // Kby2/QThcJ8ySif9Va8v/rbljjO7Yl+a21dA6fHOmWaQ
// SIG // jP9qYn/dxUoLkSbiOewZSnFjnXshbcOco6I8+n99lmqQ
// SIG // eKZt0uGc+R38ONiU9MalCpaGpL2eGq4EQoO4tYCbIjgg
// SIG // tSXlZOz39L9+Y1klD3ouOVd2onGqBooPiRa6YacRy5rY
// SIG // DkeagMXQzafQ732D8OE7cQnfXXSYIghh2rBQHm+98eEA
// SIG // 3+cxB6STOvdlR3jo+KhIq/fecn5ha293qYHLpwmsObvs
// SIG // xsvYgrRyzR30uIUBHoD7G4kqVDmyW9rIDVWZeodzOwjm
// SIG // mC3qjeAzLhIp9cAvVCch98isTtoouLGp25ayp0Kiyc8Z
// SIG // QU3ghvkqmqMRZjDTu3QyS99je/WZii8bxyGvWbWu3EQ8
// SIG // l1Bx16HSxVXjad5XwdHeMMD9zOZN+w2/XU/pnR4ZOC+8
// SIG // z1gFLu8NoFA12u8JJxzVs341Hgi62jbb01+P3nSISRKh
// SIG // ggLOMIICNwIBATCB+KGB0KSBzTCByjELMAkGA1UEBhMC
// SIG // VVMxEzARBgNVBAgTCldhc2hpbmd0b24xEDAOBgNVBAcT
// SIG // B1JlZG1vbmQxHjAcBgNVBAoTFU1pY3Jvc29mdCBDb3Jw
// SIG // b3JhdGlvbjElMCMGA1UECxMcTWljcm9zb2Z0IEFtZXJp
// SIG // Y2EgT3BlcmF0aW9uczEmMCQGA1UECxMdVGhhbGVzIFRT
// SIG // UyBFU046RDJDRC1FMzEwLTRBRjExJTAjBgNVBAMTHE1p
// SIG // Y3Jvc29mdCBUaW1lLVN0YW1wIFNlcnZpY2WiIwoBATAH
// SIG // BgUrDgMCGgMVAAHKWT1uAI5C4jBYSzVPcyvAxdI9oIGD
// SIG // MIGApH4wfDELMAkGA1UEBhMCVVMxEzARBgNVBAgTCldh
// SIG // c2hpbmd0b24xEDAOBgNVBAcTB1JlZG1vbmQxHjAcBgNV
// SIG // BAoTFU1pY3Jvc29mdCBDb3Jwb3JhdGlvbjEmMCQGA1UE
// SIG // AxMdTWljcm9zb2Z0IFRpbWUtU3RhbXAgUENBIDIwMTAw
// SIG // DQYJKoZIhvcNAQEFBQACBQDhJPIhMCIYDzIwMTkwOTEz
// SIG // MDAzNDQxWhgPMjAxOTA5MTQwMDM0NDFaMHcwPQYKKwYB
// SIG // BAGEWQoEATEvMC0wCgIFAOEk8iECAQAwCgIBAAICK4MC
// SIG // Af8wBwIBAAICElkwCgIFAOEmQ6ECAQAwNgYKKwYBBAGE
// SIG // WQoEAjEoMCYwDAYKKwYBBAGEWQoDAqAKMAgCAQACAweh
// SIG // IKEKMAgCAQACAwGGoDANBgkqhkiG9w0BAQUFAAOBgQCS
// SIG // wzyNSXNro6O2SM2j2cX1+Byy2O+JqmH82xy/G4PR/1Hd
// SIG // Yk85R0KyH5HP/de/q/n/Xf2v4RehY+yHLoZrKkd38g9R
// SIG // 7bUCcDX51IlPfdKWMIXBkePc4ybkgm3g4+B9BkigoqEh
// SIG // rvrIUMRFC1OfYFjWSqoykJn3d0fxxHPzoweaoTGCAw0w
// SIG // ggMJAgEBMIGTMHwxCzAJBgNVBAYTAlVTMRMwEQYDVQQI
// SIG // EwpXYXNoaW5ndG9uMRAwDgYDVQQHEwdSZWRtb25kMR4w
// SIG // HAYDVQQKExVNaWNyb3NvZnQgQ29ycG9yYXRpb24xJjAk
// SIG // BgNVBAMTHU1pY3Jvc29mdCBUaW1lLVN0YW1wIFBDQSAy
// SIG // MDEwAhMzAAAA+dMLshkBGsEtAAAAAAD5MA0GCWCGSAFl
// SIG // AwQCAQUAoIIBSjAaBgkqhkiG9w0BCQMxDQYLKoZIhvcN
// SIG // AQkQAQQwLwYJKoZIhvcNAQkEMSIEINUZRX8NyhF0p/4f
// SIG // IxR9L5drX+6nV9geDdqy29lJrzD0MIH6BgsqhkiG9w0B
// SIG // CRACLzGB6jCB5zCB5DCBvQQgxqNZdp7PK01AVLZKTwVv
// SIG // OJj1Iso3rTEOwivbZO5c/d8wgZgwgYCkfjB8MQswCQYD
// SIG // VQQGEwJVUzETMBEGA1UECBMKV2FzaGluZ3RvbjEQMA4G
// SIG // A1UEBxMHUmVkbW9uZDEeMBwGA1UEChMVTWljcm9zb2Z0
// SIG // IENvcnBvcmF0aW9uMSYwJAYDVQQDEx1NaWNyb3NvZnQg
// SIG // VGltZS1TdGFtcCBQQ0EgMjAxMAITMwAAAPnTC7IZARrB
// SIG // LQAAAAAA+TAiBCAKJnnQwIKVWOO0OppEP2GkcjiZcUt1
// SIG // RNF7nF0JbP8MAjANBgkqhkiG9w0BAQsFAASCAQAQGIGT
// SIG // UvOgGiSASwMtod2447yA8znLD/VCwP/FacU+hXZ65yTn
// SIG // 72+3z5/0QJGU9I2gaha7d/SIOsPl8puwfUOpVwIgcH4b
// SIG // 2ZfrehJMjJG3vMrGZrOEws33GpOqcMa4RrwLeLjXtdEr
// SIG // najZJzk+tdDsWZL7zzGLYxlwviCrul/Gds3JNkzlIp8c
// SIG // 449PA1qwj8EmcsoO0da2o1NT0dpp0SYtsISlS+TbDccI
// SIG // 7bJq52qiIZcQAkq0C5iSM5reL/Ki/k38JHtcsgyn9fpt
// SIG // 2tEhwbwBVOO+c7M5XOhKhcF3QTeVd1MKx4xS6p0F+VAM
// SIG // 6RX/kBKfDtKnHqKup5ejs3HHN0EI
// SIG // End signature block
