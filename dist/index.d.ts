import { FileHandle } from "node:fs/promises";
import { Readable, Transform, TransformCallback, TransformOptions } from "node:stream";
export declare const ARCHIVE_MAGIC_SIZE = 8;
export declare const ARCHIVE_FIELD_NAME_SIZE = 16;
export declare const ARCHIVE_FIELD_TIMESTAMP_SIZE = 12;
export declare const ARCHIVE_FIELD_OWNER_ID_SIZE = 6;
export declare const ARCHIVE_FIELD_GROUP_ID_SIZE = 6;
export declare const ARCHIVE_FIELD_MODE_SIZE = 8;
export declare const ARCHIVE_FIELD_SIZE_SIZE = 10;
export declare const ARCHIVE_FIELD_END_SIZE = 2;
export declare const ARCHIVE_ENTRY_SIZE: number;
export declare const ARCHIVE_MAGIC: Buffer;
export declare const ARCHIVE_END: Buffer;
export interface IArchiveEntry {
    name: string;
    mtime: number;
    ownerId: number;
    groupId: number;
    mode: string;
    size: number;
    content: Buffer;
}
export interface WriteArchiveEntry extends Omit<IArchiveEntry, "content" | "size"> {
    size?: number;
    content: Buffer | ArrayBufferLike | Readable;
}
declare class ArchiveStream extends Transform {
    headerParsed: boolean;
    next: number;
    current: number;
    buffer: Buffer[];
    entry: IArchiveEntry | null;
    constructor(opts?: TransformOptions);
    _transform(chunk: any, encoding: BufferEncoding, callback: TransformCallback): void;
    parse(callback: TransformCallback): void;
}
declare class UnArchiveStream extends Transform {
    headerWritten: boolean;
    constructor(opts?: TransformOptions);
    writeField(entry: WriteArchiveEntry, name: keyof Omit<WriteArchiveEntry, "content">, size: number): void;
    _transform(chunk: WriteArchiveEntry, encoding: BufferEncoding, callback: TransformCallback): void;
}
export declare const createArchiveStream: () => ArchiveStream;
export declare const createUnArchiveStream: () => UnArchiveStream;
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
export declare class Archive {
    readonly fd: FileHandle;
    readonly entries: readonly ArchiveEntry[];
    constructor(fd: FileHandle, entries: readonly ArchiveEntry[]);
    close(): Promise<void>;
    read(entry: ArchiveEntry, buffer?: Buffer, offset?: number, length?: number, bufferOffset?: number): Promise<import("fs/promises").FileReadResult<Buffer>>;
    static open(file: string, opt?: ArchiveOpenOption): Promise<Archive>;
}
export {};
