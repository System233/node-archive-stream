// Copyright (c) 2024 System233
//
// This software is released under the MIT License.
// https://opensource.org/licenses/MIT

import { Archive } from "../lib/index.js";

const archive = await Archive.open("tests/example.deb", {
  //   noEndCheck: true,
});
console.log(archive.entries);

const data = archive.entries.find((item) => item.name == "control.tar.zst");
console.log(await archive.read(data!));
