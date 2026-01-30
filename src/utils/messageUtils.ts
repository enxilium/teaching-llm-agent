import { Message } from '@/utils/types';

// Looser type for input messages that may have additional properties
type InputMessage = Message | {
  id?: number | string;
  sender?: string;
  agentId?: string | null;
  text?: unknown;
  timestamp?: Date | string | number;
  onComplete?: unknown;
  [key: string]: unknown;
};

/**
 * Prepares message objects for database storage by removing non-serializable properties
 * and ensuring correct data formats
 */
export const prepareMessagesForStorage = (messages: Message[] | InputMessage[]): Message[] => {
  // CRITICAL DEBUG POINT - Log incoming messages
  console.log(`🧐 prepareMessagesForStorage called with ${messages?.length || 0} messages`);
  
  // Show structure of first message if available
  if (messages && messages.length > 0) {
    console.log(`📄 Sample message structure:`, JSON.stringify(messages[0]));
  }

  // Safety check for non-array input
  if (!Array.isArray(messages)) {
    console.error("❌ prepareMessagesForStorage: Input is not an array, returning empty array");
    return [];
  }
  
  if (messages.length === 0) {
    console.log("⚠️ prepareMessagesForStorage: Empty messages array");
    return [];
  }
  
  try {
    // Log sample before processing
    if (messages.length > 0) {
      console.log("📝 Sample raw message:", JSON.stringify(messages[0]));
    }
    
    // CRITICAL FIX: Create a more permissive filter that retains more messages
    // Only filter out null/undefined messages and typing indicators
    const validMessages = messages.filter(msg => {
      // Skip null/undefined messages
      if (!msg) {
        console.log("Skipping null/undefined message");
        return false;
      }
      
      // Skip typing indicators (but log them)
      if (msg.text === '...' || msg.text === '') {
        console.log("Skipping empty or typing indicator message");
        return false;
      }
      
      // Skip system messages - IMPORTANT NEW FILTER
      if (msg.sender === 'system') {
        console.log("Skipping system message:", typeof msg.text === 'string' ? msg.text.substring(0, 30) + '...' : 'non-string message');
        return false;
      }
      
      // Remove messages with onComplete functions (not serializable)
      if ('onComplete' in msg) {
        delete (msg as Record<string, unknown>).onComplete;
      }
      
      // CRITICAL CHANGE: Accept ANY message with valid text
      // Previously might have been filtering too strictly
      return true;
    });
    
    // CRITICAL DEBUG POINT #2: Log after filtering
    console.log(`⚠️ After filtering: ${validMessages.length}/${messages.length} messages retained`);
    
    // Process each message to ensure proper format
    const formattedMessages = validMessages.map((msg, index) => {
      // Ensure text is a string
      let textContent: string = msg.text as string;
      if (typeof textContent !== 'string') {
        try {
          textContent = JSON.stringify(textContent);
        } catch {
          textContent = String(textContent || '');
        }
      }
      
      // Format timestamp properly for MongoDB
      let timestamp;
      try {
        // Handle different timestamp formats
        if (msg.timestamp) {
          if (msg.timestamp instanceof Date) {
            timestamp = msg.timestamp;
          } else if (typeof msg.timestamp === 'string') {
            timestamp = new Date(msg.timestamp);
          } else if (typeof msg.timestamp === 'number') {
            timestamp = new Date(msg.timestamp);
          } else {
            timestamp = new Date();
          }
        } else {
          timestamp = new Date();
        }
        
        // Check if timestamp is valid
        if (isNaN(timestamp.getTime())) {
          console.warn(`Invalid timestamp for message ${index}, using current time`);
          timestamp = new Date();
        }
      } catch {
        console.warn(`Error processing timestamp for message ${index}, using current time`);
        timestamp = new Date();
      }
      
      // IMPORTANT: Keep sender as 'user' or 'ai' for schema validation
      // The agentId field is used to differentiate between agents (bob, alice, charlie)
      // Do NOT change sender to descriptive names - this breaks schema validation
      const senderValue = msg.sender === 'user' ? 'user' : 'ai';
      
      // Return a clean, consistent message format
      return {
        id: typeof msg.id === 'number' ? msg.id : index,
        sender: senderValue,
        agentId: msg.agentId || null,
        text: textContent,
        timestamp: timestamp instanceof Date ? timestamp.toISOString() : String(timestamp)
      };
    });
    
    // CRITICAL DEBUG POINT #3: Log output
    console.log(`✅ Final prepared messages: ${formattedMessages.length}`);
    if (formattedMessages.length > 0) {
      console.log("📝 Sample prepared message:", JSON.stringify(formattedMessages[0]));
    }
    
    // Before returning, log what's being returned
    console.log(`✅ prepareMessagesForStorage returning ${formattedMessages.length} messages`);
    return formattedMessages;
  } catch (error) {
    console.error("❌ Error in prepareMessagesForStorage:", error);
    // Return original messages as fallback - CRITICAL FIX: Instead of empty array
    const fallbackMessages = messages
      // Also filter out system messages in the fallback path
      .filter(msg => msg && msg.sender !== 'system')
      .map((msg, index) => {
      // IMPORTANT: Keep sender as 'user' or 'ai' for schema validation
      // The agentId field is used to differentiate between agents (bob, alice, charlie)
      const senderValue = msg?.sender === 'user' ? 'user' : 'ai';
      
      return {
        id: typeof msg?.id === 'number' ? msg.id : index,
        sender: senderValue,
        agentId: msg?.agentId || null,
        text: String(msg?.text || ''),
        timestamp: (() => {
          try {
            const date = msg?.timestamp ? new Date(msg.timestamp) : new Date();
            return date.toISOString();
          } catch {
            return new Date().toISOString();
          }
        })()
      };
    });
    console.log(`✅ prepareMessagesForStorage returning fallback messages: ${fallbackMessages.length}`);
    return fallbackMessages;
  }
};