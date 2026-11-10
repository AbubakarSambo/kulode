'use strict';

const fs = require('fs');

const IMAGE_SUBSYSTEM_WINDOWS_GUI = 2;
const IMAGE_SUBSYSTEM_WINDOWS_CUI = 3;

/**
 * Flips a Windows .exe from a console program to a windowed one by rewriting the Subsystem
 * field of its PE header. Windows opens a console window for console programs and none for
 * windowed ones; nothing else about the program changes.
 */
function setGuiSubsystem(exePath) {
  const fd = fs.openSync(exePath, 'r+');
  try {
    const dos = Buffer.alloc(64);
    fs.readSync(fd, dos, 0, 64, 0);
    if (dos.toString('latin1', 0, 2) !== 'MZ') throw new Error(`${exePath} is not a Windows executable`);

    const peOffset = dos.readUInt32LE(0x3c);
    const signature = Buffer.alloc(4);
    fs.readSync(fd, signature, 0, 4, peOffset);
    if (signature.toString('latin1') !== 'PE\0\0') throw new Error(`${exePath} has no PE header`);

    // PE signature (4 bytes) + COFF file header (20 bytes), then Subsystem sits 68 bytes into
    // the optional header — the same offset for 32-bit and 64-bit programs.
    const subsystemOffset = peOffset + 4 + 20 + 68;
    const field = Buffer.alloc(2);
    fs.readSync(fd, field, 0, 2, subsystemOffset);
    const current = field.readUInt16LE(0);
    if (current === IMAGE_SUBSYSTEM_WINDOWS_GUI) return;
    if (current !== IMAGE_SUBSYSTEM_WINDOWS_CUI) {
      throw new Error(`${exePath} has unexpected subsystem ${current}; refusing to change it`);
    }
    field.writeUInt16LE(IMAGE_SUBSYSTEM_WINDOWS_GUI, 0);
    fs.writeSync(fd, field, 0, 2, subsystemOffset);
  } finally {
    fs.closeSync(fd);
  }
}

module.exports = { setGuiSubsystem };
