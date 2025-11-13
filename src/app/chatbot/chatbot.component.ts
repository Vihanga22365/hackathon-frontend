import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface Message {
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
}

@Component({
  selector: 'app-chatbot',
  imports: [CommonModule, FormsModule],
  templateUrl: './chatbot.component.html',
  styleUrl: './chatbot.component.scss',
})
export class ChatbotComponent {
  isOpen = false;
  isMinimized = false;
  messageText = '';
  messages: Message[] = [
    {
      text: 'Hi there! 👋 How can I help you today?',
      sender: 'bot',
      timestamp: new Date(),
    },
  ];

  toggleChat() {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.isMinimized = false;
    }
  }

  minimizeChat() {
    this.isMinimized = !this.isMinimized;
  }

  closeChat() {
    this.isOpen = false;
    this.isMinimized = false;
  }

  sendMessage() {
    if (this.messageText.trim()) {
      // Add user message
      this.messages.push({
        text: this.messageText,
        sender: 'user',
        timestamp: new Date(),
      });

      const userMessage = this.messageText.toLowerCase();
      this.messageText = '';

      // Simulate bot response
      setTimeout(() => {
        this.addBotResponse(userMessage);
      }, 1000);
    }
  }

  addBotResponse(userMessage: string) {
    let response = '';

    if (userMessage.includes('hello') || userMessage.includes('hi')) {
      response = 'Hello! How can I assist you today?';
    } else if (userMessage.includes('help')) {
      response =
        "I'm here to help! You can ask me about our services, pricing, or any general questions.";
    } else if (userMessage.includes('price') || userMessage.includes('cost')) {
      response =
        'Our pricing varies depending on your needs. Would you like to schedule a consultation?';
    } else if (userMessage.includes('thank')) {
      response = "You're welcome! Is there anything else I can help you with?";
    } else if (userMessage.includes('bye')) {
      response = 'Goodbye! Have a great day! Feel free to reach out anytime.';
    } else {
      response =
        "Thanks for your message! Our team will get back to you shortly. Is there anything specific you'd like to know?";
    }

    this.messages.push({
      text: response,
      sender: 'bot',
      timestamp: new Date(),
    });
  }

  handleKeyPress(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }
}
