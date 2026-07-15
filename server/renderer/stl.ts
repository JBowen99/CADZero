export interface TriangleMesh {
  positions: number[];
  triangleCount: number;
}

function looksBinary(buf: Buffer): boolean {
  if (buf.length < 84) return false;
  const count = buf.readUInt32LE(80);
  return buf.length === 84 + count * 50;
}

function parseBinaryStl(buf: Buffer): TriangleMesh {
  const count = buf.readUInt32LE(80);
  const positions: number[] = [];
  let offset = 84;
  for (let i = 0; i < count; i++) {
    offset += 12;
    for (let v = 0; v < 3; v++) {
      positions.push(
        buf.readFloatLE(offset),
        buf.readFloatLE(offset + 4),
        buf.readFloatLE(offset + 8),
      );
      offset += 12;
    }
    offset += 2;
  }
  return { positions, triangleCount: count };
}

function parseAsciiStl(buf: Buffer): TriangleMesh {
  const text = buf.toString("latin1");
  const positions: number[] = [];
  const re = /vertex\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    positions.push(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  return { positions, triangleCount: Math.floor(positions.length / 9) };
}

export function parseStl(buf: Buffer): TriangleMesh {
  return looksBinary(buf) ? parseBinaryStl(buf) : parseAsciiStl(buf);
}
