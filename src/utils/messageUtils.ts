/**
 * Prepares message objects for database storage by removing non-serializable properties
 * and ensuring correct data formats
 */
export const prepareMessagesForStorage = (messages: any[]): any[] => {
  console.log(`Processing ${messages?.length || 0} raw messages for storage`);
  
  if (!Array.isArray(messages) || messages.length === 0) {
    console.log("No messages to prepare for storage, returning empty array");
    return [];
  }
  
  try {
    // Filter out typing indicators and format messages properly
    const validMessages = messages.filter(msg => {
      // Skip null/undefined messages
      if (!msg) return false;
      
      // Skip typing indicators
      if (msg.text === '...') return false;
      
      // Ensure message has required fields
      return msg.sender && (msg.text !== undefined);
    });
    
    console.log(`Found ${validMessages.length} valid messages after filtering`);
    
    // Map to proper format
    const formattedMessages = validMessages.map(msg => {
      let textContent = msg.text;
      
      // Convert text content to string if it's not already
      if (typeof textContent !== 'string') {
        try {
          textContent = JSON.stringify(textContent);
        } catch (e) {
          textContent = String(textContent || '');
        }
      }
      
      return {
        id: typeof msg.id === 'number' ? msg.id : 0,
        sender: String(msg.sender || 'system'),
        agentId: msg.agentId || null,
        text: textContent,
        timestamp: msg.timestamp || new Date().toISOString()
      };
    });
    
    console.log(`Successfully prepared ${formattedMessages.length} messages for storage`);
    return formattedMessages;
  } catch (error) {
    console.error("Error preparing messages for storage:", error);
    return []; // Return empty array on error
  }
}