import { describe, expect, it } from "vitest";
import { parseListeningPorts } from "./ports.js";

describe("ports", () => {
  it("parses macOS lsof listening output", () => {
    const rows = parseListeningPorts(`COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME
node    48097 user   17u  IPv4  0xcd 0t0 TCP 127.0.0.1:43110 (LISTEN)
rapportd 1187 user   13u  IPv4  0xab 0t0 TCP *:49152 (LISTEN)
`);

    expect(rows).toEqual([
      expect.objectContaining({ command: "node", pid: 48097, port: 43110 }),
      expect.objectContaining({ command: "rapportd", pid: 1187, port: 49152 })
    ]);
  });

  it("ignores rows without a parseable port", () => {
    expect(parseListeningPorts("COMMAND PID USER NAME\nnode 1 user not-a-listener\n")).toEqual([]);
  });
});
