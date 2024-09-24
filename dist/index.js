// Copyright (c) 2024 System233
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT
import { open } from "node:fs/promises";
import { Transform, } from "node:stream";
import { inspect } from "node:util";
import { isArrayBuffer, isArrayBufferView } from "node:util/types";
export const ARCHIVE_MAGIC_SIZE = 8;
export const ARCHIVE_FIELD_NAME_SIZE = 16;
export const ARCHIVE_FIELD_TIMESTAMP_SIZE = 12;
export const ARCHIVE_FIELD_OWNER_ID_SIZE = 6;
export const ARCHIVE_FIELD_GROUP_ID_SIZE = 6;
export const ARCHIVE_FIELD_MODE_SIZE = 8;
export const ARCHIVE_FIELD_SIZE_SIZE = 10;
export const ARCHIVE_FIELD_END_SIZE = 2;
export const ARCHIVE_ENTRY_SIZE = ARCHIVE_FIELD_NAME_SIZE +
    ARCHIVE_FIELD_TIMESTAMP_SIZE +
    ARCHIVE_FIELD_OWNER_ID_SIZE +
    ARCHIVE_FIELD_GROUP_ID_SIZE +
    ARCHIVE_FIELD_MODE_SIZE +
    ARCHIVE_FIELD_SIZE_SIZE +
    ARCHIVE_FIELD_END_SIZE;
export const ARCHIVE_MAGIC = Buffer.from("!<arch>\n");
export const ARCHIVE_END = Buffer.from("`\n");
class ArchiveStream extends Transform {
    headerParsed = false;
    next = ARCHIVE_MAGIC_SIZE;
    current = 0;
    buffer = [];
    entry = null;
    constructor(opts) {
        super({ ...opts, objectMode: true });
    }
    _transform(chunk, encoding, callback) {
        this.buffer.push(chunk);
        this.current += chunk.byteLength;
        if (this.current >= this.next) {
            this.parse(callback);
        }
        else {
            callback();
        }
    }
    parse(callback) {
        const data = Buffer.concat(this.buffer);
        let offset = 0;
        const nextField = (size, type) => {
            const buffer = data.subarray(offset, offset + size);
            offset += size;
            if (type == "text") {
                return buffer.toString().trim();
            }
            if (type == "number") {
                return parseInt(buffer.toString().trim());
            }
            return buffer;
        };
        if (!this.headerParsed) {
            const header = nextField(ARCHIVE_MAGIC_SIZE, "buffer");
            if (ARCHIVE_MAGIC.compare(header) != 0) {
                callback(new Error("ArchiveStream: Bad Magic: " + inspect(header)));
                return;
            }
            //   offset += ARCHIVE_MAGIC_SIZE;
            this.next = ARCHIVE_ENTRY_SIZE;
            this.headerParsed = true;
        }
        while (this.current - offset >= this.next) {
            if (!this.entry) {
                this.entry = {
                    name: nextField(ARCHIVE_FIELD_NAME_SIZE, "text"),
                    mtime: nextField(ARCHIVE_FIELD_TIMESTAMP_SIZE, "number"),
                    ownerId: nextField(ARCHIVE_FIELD_OWNER_ID_SIZE, "number"),
                    groupId: nextField(ARCHIVE_FIELD_GROUP_ID_SIZE, "number"),
                    mode: nextField(ARCHIVE_FIELD_MODE_SIZE, "text"),
                    size: nextField(ARCHIVE_FIELD_SIZE_SIZE, "number"),
                    content: null,
                };
                const end = nextField(ARCHIVE_FIELD_END_SIZE, "buffer");
                if (ARCHIVE_END.compare(end) != 0) {
                    callback(new Error("ArchiveStream: Bad End: " + inspect(end)));
                    return;
                }
                this.next = this.entry.size;
            }
            else {
                this.entry.content = nextField(this.next, "buffer");
                this.push(this.entry);
                this.entry = null;
                this.next = ARCHIVE_ENTRY_SIZE;
            }
        }
        this.buffer = [data.subarray(offset)];
        callback();
    }
}
class UnArchiveStream extends Transform {
    headerWritten = false;
    constructor(opts) {
        super({ ...opts, objectMode: true });
    }
    writeField(entry, name, size) {
        const field = (entry[name] ?? "").toString();
        const value = Buffer.from(field.padEnd(size));
        if (value.byteLength > size) {
            throw new Error(`UnArchiveStream: field too long: ${name}, value=${inspect(value)}`);
        }
        this.push(value);
    }
    _transform(chunk, encoding, callback) {
        if (!this.headerWritten) {
            this.push(Buffer.from(ARCHIVE_MAGIC));
        }
        if (isArrayBuffer(chunk.content) || isArrayBufferView(chunk.content)) {
            chunk.size = chunk.content.byteLength;
        }
        try {
            if (chunk.size == null) {
                throw new Error("UnArchiveStream: The size field must be set for streaming content");
            }
            this.writeField(chunk, "name", ARCHIVE_FIELD_NAME_SIZE);
            this.writeField(chunk, "mtime", ARCHIVE_FIELD_TIMESTAMP_SIZE);
            this.writeField(chunk, "ownerId", ARCHIVE_FIELD_OWNER_ID_SIZE);
            this.writeField(chunk, "groupId", ARCHIVE_FIELD_GROUP_ID_SIZE);
            this.writeField(chunk, "mode", ARCHIVE_FIELD_MODE_SIZE);
            this.writeField(chunk, "size", ARCHIVE_FIELD_SIZE_SIZE);
            this.push(ARCHIVE_END);
            if (isArrayBuffer(chunk.content) || isArrayBufferView(chunk.content)) {
                this.push(chunk.content);
                callback();
            }
            else {
                const stream = chunk.content;
                stream.pipe(this, { end: false });
                stream.once("error", callback);
                stream.once("end", () => {
                    stream.off("error", callback);
                    callback();
                });
            }
        }
        catch (err) {
            callback(err);
        }
    }
}
export const createArchiveStream = () => new ArchiveStream();
export const createUnArchiveStream = () => new UnArchiveStream();
export class Archive {
    fd;
    entries;
    constructor(fd, entries) {
        this.fd = fd;
        this.entries = entries;
    }
    close() {
        return this.fd.close();
    }
    read(entry, buffer, offset, length, bufferOffset) {
        offset ??= 0;
        length ??= entry.size;
        bufferOffset ??= 0;
        buffer ??= Buffer.alloc(length);
        return this.fd.read(buffer, bufferOffset, length, entry.offset + offset);
    }
    static async open(file, opt) {
        const fd = await open(file, "r");
        try {
            const buffer = Buffer.alloc(ARCHIVE_ENTRY_SIZE);
            let position = 0;
            const headerReadResult = await fd.read(buffer, 0, ARCHIVE_MAGIC_SIZE, position);
            if (ARCHIVE_MAGIC.compare(buffer, 0, ARCHIVE_MAGIC_SIZE) != 0) {
                throw new Error("Archive: Bad Magic: " +
                    file +
                    ":" +
                    inspect(buffer.subarray(0, ARCHIVE_MAGIC_SIZE)));
            }
            position += headerReadResult.bytesRead;
            let offset = 0;
            const nextField = (size, type) => {
                const value = buffer.subarray(offset, offset + size);
                offset += size;
                if (type == "text") {
                    return value.toString().trim();
                }
                if (type == "number") {
                    const raw = value.toString().trim();
                    const num = parseInt(raw);
                    if (Number.isNaN(num)) {
                        // throw new Error("Bad Field: number: " + raw);
                    }
                    return num;
                }
                return value;
            };
            const entries = [];
            while (1) {
                const result = await fd.read(buffer, 0, ARCHIVE_ENTRY_SIZE, position);
                offset = 0;
                if (!result.bytesRead) {
                    break;
                }
                position += result.bytesRead;
                const entry = {
                    name: nextField(ARCHIVE_FIELD_NAME_SIZE, "text"),
                    mtime: nextField(ARCHIVE_FIELD_TIMESTAMP_SIZE, "number"),
                    ownerId: nextField(ARCHIVE_FIELD_OWNER_ID_SIZE, "number"),
                    groupId: nextField(ARCHIVE_FIELD_GROUP_ID_SIZE, "number"),
                    mode: nextField(ARCHIVE_FIELD_MODE_SIZE, "text"),
                    size: nextField(ARCHIVE_FIELD_SIZE_SIZE, "number"),
                    offset: position,
                };
                const end = nextField(ARCHIVE_FIELD_END_SIZE, "buffer");
                if (!opt?.noEndCheck) {
                    if (ARCHIVE_END.compare(end, 0, ARCHIVE_FIELD_END_SIZE) != 0) {
                        throw new Error("Archive: Bad End: " + inspect(end));
                    }
                }
                entries.push(entry);
                position += entry.size;
            }
            return new Archive(fd, entries);
        }
        catch (error) {
            fd.close();
            throw error;
        }
    }
}
