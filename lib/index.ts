// Copyright (c) 2024 System233
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { FileHandle, open } from "node:fs/promises";
import {
  Readable,
  Transform,
  TransformCallback,
  TransformOptions,
} from "node:stream";
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

export const ARCHIVE_ENTRY_SIZE =
  ARCHIVE_FIELD_NAME_SIZE +
  ARCHIVE_FIELD_TIMESTAMP_SIZE +
  ARCHIVE_FIELD_OWNER_ID_SIZE +
  ARCHIVE_FIELD_GROUP_ID_SIZE +
  ARCHIVE_FIELD_MODE_SIZE +
  ARCHIVE_FIELD_SIZE_SIZE +
  ARCHIVE_FIELD_END_SIZE;
export const ARCHIVE_MAGIC = Buffer.from("!<arch>\n");
export const ARCHIVE_END = Buffer.from("`\n");
export interface IArchiveEntry {
  name: string; //16
  mtime: number; //12
  ownerId: number; //6
  groupId: number; //6
  mode: string; //8
  size: number; //10
  content: Buffer; //size
}
export interface WriteArchiveEntry
  extends Omit<IArchiveEntry, "content" | "size"> {
  size?: number; //10
  content: Buffer | ArrayBufferLike | Readable;
}
class ArchiveStream extends Transform {
  headerParsed = false;
  next = ARCHIVE_MAGIC_SIZE;
  current = 0;
  position = 0;
  buffer: Buffer[] = [];
  entry: IArchiveEntry | null = null;
  constructor(opts?: TransformOptions) {
    super({ ...opts, objectMode: true });
  }
  _transform(
    chunk: any,
    encoding: BufferEncoding,
    callback: TransformCallback
  ): void {
    this.buffer.push(chunk);
    this.current += chunk.byteLength;
    this.position += chunk.byteLength;
    if (this.current >= this.next) {
      this.parse(callback);
    } else {
      callback();
    }
  }
  parse(callback: TransformCallback) {
    const data = Buffer.concat(this.buffer);
    let offset = 0;

    const nextField: {
      (size: number, type: "number"): number;
      (size: number, type: "text"): string;
      (size: number, type: "buffer"): Buffer;
    } = (size: number, type: "number" | "text" | "buffer"): any => {
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
        callback(
          new Error(
            "ArchiveStream: Bad Magic: " +
              inspect(header) +
              " at " +
              this.position
          )
        );
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
          content: null as any,
        };
        const end = nextField(ARCHIVE_FIELD_END_SIZE, "buffer");
        if (ARCHIVE_END.compare(end) != 0) {
          callback(
            new Error(
              "ArchiveStream: Bad End: " +
                inspect(end) +
                " at " +
                this.position +
                offset
            )
          );
          return;
        }
        this.next = this.entry.size;
      } else {
        this.entry.content = nextField(this.next, "buffer");
        this.push(this.entry);
        this.entry = null;
        this.next = ARCHIVE_ENTRY_SIZE;
      }
    }
    this.buffer = [data.subarray(offset)];
    this.current = data.byteLength - offset;
    callback();
  }
}
class UnArchiveStream extends Transform {
  headerWritten = false;
  constructor(opts?: TransformOptions) {
    super({ ...opts, objectMode: true });
  }
  writeField(
    entry: WriteArchiveEntry,
    name: keyof Omit<WriteArchiveEntry, "content">,
    size: number
  ) {
    const field = (entry[name] ?? "").toString();
    const value = Buffer.from(field.padEnd(size));
    if (value.byteLength > size) {
      throw new Error(
        `UnArchiveStream: field too long: ${name}, value=${inspect(value)}`
      );
    }
    this.push(value);
  }
  _transform(
    chunk: WriteArchiveEntry,
    encoding: BufferEncoding,
    callback: TransformCallback
  ): void {
    if (!this.headerWritten) {
      this.push(Buffer.from(ARCHIVE_MAGIC));
    }
    if (isArrayBuffer(chunk.content) || isArrayBufferView(chunk.content)) {
      chunk.size = chunk.content.byteLength;
    }
    try {
      if (chunk.size == null) {
        throw new Error(
          "UnArchiveStream: The size field must be set for streaming content"
        );
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
      } else {
        const stream = chunk.content;
        stream.pipe(this, { end: false });
        stream.once("error", callback);
        stream.once("end", () => {
          stream.off("error", callback);
          callback();
        });
      }
    } catch (err: any) {
      callback(err);
    }
  }
}
export const createArchiveStream = () => new ArchiveStream();
export const createUnArchiveStream = () => new UnArchiveStream();

export interface ArchiveEntry extends Omit<IArchiveEntry, "content"> {
  readonly name: string;
  readonly mtime: number;
  readonly ownerId: number;
  readonly groupId: number;
  readonly mode: string;
  readonly size: number;
  readonly offset: number;
}
export interface ArchiveOpenOption {
  noEndCheck?: boolean;
}
export class Archive {
  constructor(
    readonly fd: FileHandle,
    readonly entries: readonly ArchiveEntry[]
  ) {}
  close() {
    return this.fd.close();
  }
  read(
    entry: ArchiveEntry,
    buffer?: Buffer,
    offset?: number,
    length?: number,
    bufferOffset?: number
  ) {
    offset ??= 0;
    length ??= entry.size;
    bufferOffset ??= 0;
    buffer ??= Buffer.alloc(length);
    return this.fd.read(buffer, bufferOffset, length, entry.offset + offset);
  }
  static async open(file: string, opt?: ArchiveOpenOption) {
    const fd = await open(file, "r");
    try {
      const buffer = Buffer.alloc(ARCHIVE_ENTRY_SIZE);
      let position = 0;
      const headerReadResult = await fd.read(
        buffer,
        0,
        ARCHIVE_MAGIC_SIZE,
        position
      );
      if (ARCHIVE_MAGIC.compare(buffer, 0, ARCHIVE_MAGIC_SIZE) != 0) {
        throw new Error(
          "Archive: Bad Magic: " +
            file +
            ":" +
            inspect(buffer.subarray(0, ARCHIVE_MAGIC_SIZE))
        );
      }
      position += headerReadResult.bytesRead;
      let offset = 0;
      const nextField: {
        (size: number, type: "number"): number;
        (size: number, type: "text"): string;
        (size: number, type: "buffer"): Buffer;
      } = (size: number, type: "number" | "text" | "buffer"): any => {
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

      const entries: ArchiveEntry[] = [];
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
    } catch (error) {
      fd.close();
      throw error;
    }
  }
}
