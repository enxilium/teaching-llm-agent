/**
 * Prepares message objects for database storage by removing non-serializable properties
 * and ensuring correct data formats
 */
export const prepareMessagesForStorage = (messages: any[]): any[] => {
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
      
      // Remove messages with onComplete functions (not serializable)
      delete msg.onComplete;
      
      // CRITICAL CHANGE: Accept ANY message with valid text
      // Previously might have been filtering too strictly
      return true;
    });
    
    // CRITICAL DEBUG POINT #2: Log after filtering
    console.log(`⚠️ After filtering: ${validMessages.length}/${messages.length} messages retained`);
    
    // Process each message to ensure proper format
    const formattedMessages = validMessages.map((msg, index) => {
      // Ensure text is a string
      let textContent = msg.text;
      if (typeof textContent !== 'string') {
        try {
          textContent = JSON.stringify(textContent);
        } catch (e) {
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
      } catch (e) {
        console.warn(`Error processing timestamp for message ${index}, using current time`, e);
        timestamp = new Date();
      }
      
      // Use more descriptive sender names based on agentId
      let senderName = msg.sender;
      if (msg.sender === 'ai' && msg.agentId) {
        switch (msg.agentId) {
          case 'arithmetic':
            senderName = 'Arithmetic Gap';
            break;
          case 'concept':
            senderName = 'Concept Gap';
            break;
          case 'tutor':
            senderName = 'Tutor';
            break;
          default:
            senderName = msg.agentId; // Use the agentId as fallback
        }
      } else if (msg.sender === 'user') {
        senderName = 'User';
      }
      
      // Return a clean, consistent message format
      return {
        id: typeof msg.id === 'number' ? msg.id : index,
        sender: senderName,
        agentId: msg.agentId || null,
        text: textContent,
        timestamp: timestamp
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
    const fallbackMessages = messages.map((msg, index) => {
      // Apply the same sender name transformation even in fallback path
      let senderName = String(msg?.sender || 'system');
      if (senderName === 'ai' && msg?.agentId) {
        switch(msg.agentId) {
          case 'arithmetic':
            senderName = 'Arithmetic Gap';
            break;
          case 'concept':
            senderName = 'Concept Gap';
            break;
          case 'tutor':
            senderName = 'Tutor';
            break;
          default:
            senderName = msg.agentId; // Use the agentId as fallback
        }
      } else if (senderName === 'user') {
        senderName = 'User';
      }
      
      return {
        id: msg?.id || index,
        sender: senderName,
        agentId: msg?.agentId || null,
        text: String(msg?.text || ''),
        timestamp: (() => {
          try {
            return msg?.timestamp ? new Date(msg.timestamp) : new Date();
          } catch (e) {
            return new Date();
          }
        })()
      };
    });
    console.log(`✅ prepareMessagesForStorage returning fallback messages: ${fallbackMessages.length}`);
    return fallbackMessages;
  }
};