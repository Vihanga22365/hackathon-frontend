import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import { marked } from 'marked';

interface Message {
  text: string;
  htmlContent?: SafeHtml;
  sender: 'user' | 'bot';
  timestamp: Date;
}

@Component({
  selector: 'app-chatbot',
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './chatbot.component.html',
  styleUrl: './chatbot.component.scss',
})
export class ChatbotComponent {
  isOpen = false;
  isMinimized = false;
  messageText = '';
  isTyping = false;
  messages: Message[] = [
    {
      text: 'Hi there! 👋 How can I help you today?',
      sender: 'bot',
      timestamp: new Date(),
    },
  ];
  private readonly apiBaseUrl = 'http://localhost:7282';
  private readonly appName = 'main_agent';
  private readonly userId = 'Chameera';
  private readonly sessionState = { name: 'Chameera', key2: 42 };
  private sessionId: string | null = null;
  private sessionPromise: Promise<string> | null = null;

  constructor(
    private readonly http: HttpClient,
    private readonly sanitizer: DomSanitizer
  ) {
    this.configureMarked();
  }

  private configureMarked() {
    marked.setOptions({
      breaks: true,
      gfm: true,
    });
  }

  toggleChat() {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.isMinimized = false;
      void this.ensureSessionCreated();
    }
  }

  minimizeChat() {
    this.isMinimized = !this.isMinimized;
    if (this.isOpen && !this.isMinimized) {
      void this.ensureSessionCreated();
    }
  }

  closeChat() {
    this.isOpen = false;
    this.isMinimized = false;
    this.resetSession();
    this.clearChat();
  }

  private clearChat() {
    this.messages = [
      {
        text: 'Hi there! 👋 How can I help you today?',
        sender: 'bot',
        timestamp: new Date(),
      },
    ];
    this.messageText = '';
    this.isTyping = false;
  }

  async sendMessage() {
    if (this.messageText.trim()) {
      const outgoingText = this.messageText;
      // Add user message
      this.messages.push({
        text: outgoingText,
        sender: 'user',
        timestamp: new Date(),
      });

      this.messageText = '';

      let sessionId: string;

      try {
        sessionId = await this.ensureSessionCreated();
      } catch (error) {
        console.error('Failed to create chat session', error);
        this.messages.push({
          text: 'Sorry, I could not start a chat session. Please try again later.',
          sender: 'bot',
          timestamp: new Date(),
        });
        return;
      }

      const payload = {
        appName: this.appName,
        userId: this.userId,
        sessionId,
        newMessage: {
          role: 'user',
          parts: [
            {
              text: outgoingText,
            },
          ],
        },
      };

      try {
        this.isTyping = true;
        const response = await firstValueFrom(
          this.http.post<unknown>(`${this.apiBaseUrl}/run`, payload)
        );
        this.isTyping = false;
        const replyText = this.extractMessageText(response);
        this.messages.push({
          text: replyText,
          htmlContent: this.parseMarkdown(replyText),
          sender: 'bot',
          timestamp: new Date(),
        });
      } catch (error) {
        console.error('Chat run failed', error);
        this.isTyping = false;
        const errorText = 'Something went wrong while contacting the assistant. Please try again.';
        this.messages.push({
          text: errorText,
          htmlContent: this.parseMarkdown(errorText),
          sender: 'bot',
          timestamp: new Date(),
        });
      }
    }
  }

  handleKeyPress(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void this.sendMessage();
    }
  }

  private async ensureSessionCreated(): Promise<string> {
    if (this.sessionId) {
      return this.sessionId;
    }

    if (this.sessionPromise) {
      return this.sessionPromise;
    }

    const newSessionId = this.generateSessionId();
    const url = `${this.apiBaseUrl}/apps/${
      this.appName
    }/users/${encodeURIComponent(this.userId)}/sessions/${newSessionId}`;
    const body = {
      state: this.sessionState,
    };

    const request = firstValueFrom(this.http.post(url, body))
      .then(() => {
        this.sessionId = newSessionId;
        return newSessionId;
      })
      .finally(() => {
        this.sessionPromise = null;
      });

    this.sessionPromise = request;
    return request;
  }

  private resetSession() {
    this.sessionId = null;
    this.sessionPromise = null;
  }

  private parseMarkdown(text: string): SafeHtml {
    const html = marked.parse(text) as string;
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  private generateSessionId(): string {
    const globalCrypto = (globalThis as { crypto?: Crypto }).crypto;
    if (globalCrypto?.randomUUID) {
      return globalCrypto.randomUUID();
    }

    // Fallback UUID v4 generator for environments without crypto.randomUUID support.
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
      const rand = (Math.random() * 16) | 0;
      const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
      return value.toString(16);
    });
  }

  private extractMessageText(payload: unknown): string {
    if (!payload) {
      return 'The assistant did not return a response.';
    }

    if (Array.isArray(payload)) {
      // First pass: look for actual text messages from the model
      for (const item of payload) {
        if (this.isModelTextMessage(item)) {
          const textFromItem = this.findPreferredText(item);
          if (textFromItem) {
            return textFromItem;
          }
        }
      }

      // Second pass: skip function calls/responses and look for any text
      for (const item of payload) {
        if (!this.isFunctionCallOrResponse(item)) {
          const textFromItem =
            this.findPreferredText(item) ?? this.walkForText(item);
          if (textFromItem) {
            return textFromItem;
          }
        }
      }
    }

    const candidate = this.findPreferredText(payload);
    if (candidate) {
      return candidate;
    }

    const pendingCall = this.findCallIdentifier(payload);
    if (pendingCall) {
      console.info('Assistant requested follow-up action', pendingCall);
      return 'Please hold on for a moment while I gather that information.';
    }

    try {
      return `Received response: ${JSON.stringify(payload)}`;
    } catch (error) {
      console.error('Unable to stringify response payload', error);
      return 'Received a response, but it could not be displayed.';
    }
  }

  private isModelTextMessage(item: unknown): boolean {
    if (!item || typeof item !== 'object') {
      return false;
    }

    const record = item as Record<string, unknown>;
    const content = record['content'];

    if (!content || typeof content !== 'object') {
      return false;
    }

    const contentRecord = content as Record<string, unknown>;

    // Check if role is 'model' and has text parts (not function calls)
    if (
      contentRecord['role'] === 'model' &&
      Array.isArray(contentRecord['parts'])
    ) {
      const parts = contentRecord['parts'] as unknown[];
      return parts.some((part) => {
        if (!part || typeof part !== 'object') {
          return false;
        }
        const partRecord = part as Record<string, unknown>;
        return (
          typeof partRecord['text'] === 'string' && !partRecord['functionCall']
        );
      });
    }

    return false;
  }

  private isFunctionCallOrResponse(item: unknown): boolean {
    if (!item || typeof item !== 'object') {
      return false;
    }

    const record = item as Record<string, unknown>;
    const content = record['content'];

    if (!content || typeof content !== 'object') {
      return false;
    }

    const contentRecord = content as Record<string, unknown>;

    if (Array.isArray(contentRecord['parts'])) {
      const parts = contentRecord['parts'] as unknown[];
      return parts.some((part) => {
        if (!part || typeof part !== 'object') {
          return false;
        }
        const partRecord = part as Record<string, unknown>;
        return 'functionCall' in partRecord || 'functionResponse' in partRecord;
      });
    }

    return false;
  }

  private findPreferredText(payload: unknown): string | null {
    if (Array.isArray(payload)) {
      for (const item of payload) {
        const text = this.findPreferredText(item);
        if (text) {
          return text;
        }
      }
      return null;
    }

    const data = payload as Record<string, unknown>;

    const directCandidates: unknown[] = [
      data?.['text'],
      data?.['message'],
      data?.['response'],
      data?.['result'],
      data?.['output'],
    ];

    for (const candidate of directCandidates) {
      const text = this.unwrapText(candidate);
      if (text) {
        return text;
      }
    }

    if (Array.isArray(data?.['outputs'])) {
      for (const item of data['outputs'] as unknown[]) {
        const text = this.unwrapText(item);
        if (text) {
          return text;
        }
      }
    }

    return this.walkForText(payload);
  }

  private unwrapText(candidate: unknown): string | null {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }

    if (candidate && typeof candidate === 'object') {
      const record = candidate as Record<string, unknown>;
      if (Array.isArray(record['parts'])) {
        for (const part of record['parts'] as unknown[]) {
          const text = this.unwrapText(part);
          if (text) {
            return text;
          }
        }
      }

      if (Array.isArray(record['content'])) {
        for (const item of record['content'] as unknown[]) {
          const text = this.unwrapText(item);
          if (text) {
            return text;
          }
        }
      } else if (record['content']) {
        const text = this.unwrapText(record['content']);
        if (text) {
          return text;
        }
      }

      if (typeof record['text'] === 'string') {
        const text = String(record['text']).trim();
        if (text) {
          return text;
        }
      }

      if (Array.isArray(record['messages'])) {
        for (const message of record['messages'] as unknown[]) {
          const text = this.unwrapText(message);
          if (text) {
            return text;
          }
        }
      }

      if (Array.isArray(record['candidates'])) {
        for (const candidate of record['candidates'] as unknown[]) {
          const text = this.unwrapText(candidate);
          if (text) {
            return text;
          }
        }
      }
    }

    return null;
  }

  private walkForText(value: unknown): string | null {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (
        trimmed &&
        !['user', 'assistant', 'system', 'model'].includes(
          trimmed.toLowerCase()
        )
      ) {
        if (/^call_[\w-]+$/i.test(trimmed)) {
          return null;
        }
        return trimmed;
      }
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const text = this.walkForText(item);
        if (text) {
          return text;
        }
      }
    } else if (value && typeof value === 'object') {
      for (const key of Object.keys(value as Record<string, unknown>)) {
        const text = this.walkForText((value as Record<string, unknown>)[key]);
        if (text) {
          return text;
        }
      }
    }

    return null;
  }

  private findCallIdentifier(value: unknown): string | null {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return /^call_[\w-]+$/i.test(trimmed) ? trimmed : null;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        const callId = this.findCallIdentifier(entry);
        if (callId) {
          return callId;
        }
      }
      return null;
    }

    if (value && typeof value === 'object') {
      for (const key of Object.keys(value as Record<string, unknown>)) {
        const callId = this.findCallIdentifier(
          (value as Record<string, unknown>)[key]
        );
        if (callId) {
          return callId;
        }
      }
    }

    return null;
  }
}
