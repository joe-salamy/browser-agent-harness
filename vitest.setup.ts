import "@testing-library/jest-dom/vitest";

process.env.NEXTAUTH_SECRET ??= "test-secret";
process.env.NEXTAUTH_URL ??= "http://localhost:3000";
process.env.ENCRYPTION_MASTER_KEY ??= Buffer.alloc(32, 7).toString("base64");
