// Copyright (c) 2024 System233
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { createReadStream } from "fs";
import { createArchiveStream } from "../lib/index.js";

const archiveStream = createArchiveStream();
const rs = createReadStream("tests/example.deb");
rs.pipe(archiveStream);

archiveStream.on("data", (x) => console.log(x));
