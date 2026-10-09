// Minimal ambient declarations for the Node builtins the test suites use to
// read checked-in source assets at test time (theme.css, grain.svg, sw.ts).
// The DOM lib alone does not declare them, and pulling in @types/node is out
// of scope for P0 — this narrows the surface to exactly what the suites call.

declare module "node:fs" {
  export function readFileSync(path: URL | string, encoding?: BufferEncoding): string;
}

declare module "node:path" {
  export function join(...segments: string[]): string;
}

declare const process: {
  cwd(): string;
};
