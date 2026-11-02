export type Publication = {
  schemaVersion: 1;
  publicationId: string;
  generatedAt: string;
  pages: Record<string, unknown>;
  members: Record<string, unknown>;
  media: Array<{ path: string; sha256: string; contentType: string; size: number }>;
};
export const pageKeys: readonly string[];
export function sha256(bytes: Uint8Array | string): string;
export function validatePublication(value: unknown): Publication;
export function validateBundle(directory: string): Promise<Publication>;
export function readCurrent(root: string): Promise<Publication>;
export function approveBundle(directory: string, expectedHash: string): Promise<void>;
export function activateBundle(directory: string, root: string, expectedCurrent: string): Promise<void>;
export function safeFile(root: string, relative: string): Promise<string>;
