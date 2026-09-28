// Next.js 14 App Router Type Definitions for NextRequest & NextResponse
declare module 'next/server' {
  export class NextRequest extends Request {
    nextUrl: URL;
    cookies: {
      get(name: string): { name: string; value: string } | undefined;
      getAll(): { name: string; value: string }[];
      has(name: string): boolean;
      set(name: string, value: string): void;
      delete(name: string): void;
    };
  }

  export class NextResponse<Body = any> extends Response {
    static json<T = any>(body: T, init?: ResponseInit): NextResponse<T>;
    static redirect(url: string | URL, status?: number): NextResponse;
    static rewrite(destination: string | URL): NextResponse;
    static next(): NextResponse;
  }
}
