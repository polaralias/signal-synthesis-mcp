import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

export class WebSseTransport implements Transport {
  private _reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private _writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private _ready = false;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(private _readable: ReadableStream<Uint8Array>, private _writable: WritableStream<Uint8Array>) {}

  async start(): Promise<void> {
    if (this._ready) return;
    this._ready = true;
    this._reader = this._readable.getReader();
    this._writer = this._writable.getWriter();

    // Start reading loop
    this.readLoop().catch((error) => {
        if (this.onerror) this.onerror(error);
        this.close();
    });
  }

  private async readLoop() {
      if (!this._reader) return;
      try {
          while (true) {
              const { done, value } = await this._reader.read();
              if (done) break;
              // In SSE, messages are text. We assume the stream delivers complete events or we need to buffer.
              // For a worker receiving POST messages, this transport might be slightly different.
              // The typical SSEServerTransport logic is:
              // 1. Send SSE events via response stream (writer)
              // 2. Receive JSON-RPC messages via POST body (not stream).

              // Wait, the SDK Transport interface assumes full duplex usually.
              // SSEServerTransport separates them: one HTTP connection for output (SSE), one for input (POST).
              // So this class is actually just for the OUTPUT (Response).
          }
      } catch (e) {
          console.error("Error reading stream", e);
      } finally {
          this.close();
      }
  }

  async close(): Promise<void> {
    if (!this._ready) return;
    this._ready = false;
    try {
        await this._writer?.close();
        await this._reader?.cancel();
    } catch (e) {
        // Ignore close errors
    }
    if (this.onclose) this.onclose();
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this._writer) throw new Error('Transport not started');

    // Format as SSE event
    // JSONRPCMessage is a union type. Some members might not have 'id' (e.g. notifications).
    // We cast to any to access id safely or check type.
    const eventId = (message as any).id ?? '';
    const data = JSON.stringify(message);
    const event = `event: message\nid: ${eventId}\ndata: ${data}\n\n`;

    const encoder = new TextEncoder();
    await this._writer.write(encoder.encode(event));
  }

  // Method to handle incoming messages (e.g. from a POST request)
  async handlePostMessage(message: JSONRPCMessage) {
      if (this.onmessage) {
          this.onmessage(message);
      }
  }
}
