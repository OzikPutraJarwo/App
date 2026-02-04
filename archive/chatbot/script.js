const chatBox = document.getElementById('chatBox');
const userInput = document.getElementById('userInput');

function loadChat() {
    const chatHistory = JSON.parse(localStorage.getItem('chatHistory')) || [];
    chatHistory.forEach(msg => {
        const messageElement = document.createElement('div');
        messageElement.className = 'message api-message item';
        messageElement.innerHTML = formatMessage(msg);
        chatBox.appendChild(messageElement);
    });
    chatBox.scrollTop = chatBox.scrollHeight;
}

function checkEnter(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

async function sendMessage() {
    const message = userInput.value;
    if (!message) return;

    displayMessage(message, 'user');
    userInput.value = '';

    const loadingMessage = displayMessage('Menunggu respon...', 'api');

    try {
        const response = await fetch(`https://text.pollinations.ai/${encodeURIComponent(message)}`);
        const data = await response.text();
        chatBox.removeChild(loadingMessage);
        displayMessage(data, 'api');
        saveChat(message);
        saveChat(data);
        setTimeout(() => {
            userInput.disabled = false;
        }, 3000);
    } catch (error) {
        console.error('Error:', error);
        chatBox.removeChild(loadingMessage);
        displayMessage('Terjadi kesalahan, coba lagi.', 'api');
        setTimeout(() => {
            userInput.disabled = false;
        }, 3000);
    }
}

function displayMessage(message, sender) {
    const messageElement = document.createElement('div');
    messageElement.className = `message ${sender}-message`;
    messageElement.innerHTML = formatMessage(message);
    chatBox.appendChild(messageElement);
    chatBox.scrollTop = chatBox.scrollHeight;
    return messageElement;
}

function formatMessage(message) {
    return message.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
}

function saveChat(message) {
    const chatHistory = JSON.parse(localStorage.getItem('chatHistory')) || [];
    chatHistory.push(message);
    localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
}

function clearChat() {
    localStorage.removeItem('chatHistory');
    chatBox.innerHTML = '';
}

window.onload = loadChat;