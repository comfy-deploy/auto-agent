const testAgent = async () => {
  const baseUrl = 'http://localhost:3000';
  
  const testCases = [
    { prompt: "find image generation models" },
    { prompt: "search for video models" },
    { prompt: "show me image to video models" },
    { prompt: "find flux models" },
    { prompt: "list kling video models" }
  ];
  
  console.log('Testing agent endpoint...\n');
  
  for (const testCase of testCases) {
    console.log(`\n--- Test: "${testCase.prompt}" ---`);
    
    try {
      const response = await fetch(`${baseUrl}/api/agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testCase)
      });
      
      const data = await response.json();
      
      if (response.ok) {
        console.log('Available tools:', data.tools);
        console.log('\nMessages:');
        data.messages.forEach((msg: any) => {
          console.log(`[${msg.role}]: ${msg.content}`);
          if (msg.toolCall) {
            console.log('Tool call:', JSON.stringify(msg.toolCall.parameters));
          }
        });
      } else {
        console.error('Error:', data.error);
      }
    } catch (error) {
      console.error('Request failed:', error);
    }
  }
};

testAgent();