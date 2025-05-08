// ==UserScript==
// @name         Groq Selected Text Reviewer
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Sends selected text to Groq API and displays it as markdown
// @match        *://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_addElement
// @grant        unsafeWindow
// @connect      api.groq.com
// @connect      cdn.jsdelivr.net
// ==/UserScript==

// Add CSS styles
const styles = `
::selection {
    background: #b3d4fc;
    color: #000;
}

#groq-modal {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    border-radius: 8px;
}

#groq-modal-content {
    line-height: 1.5;
    margin-bottom: 15px;
}

#groq-modal-close {
    background: #4a4a4a;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    float: right;
}

#groq-modal-close:hover {
    background: #666;
}
`;

// 1. Load marked from CDN via GM_xmlhttpRequest
GM_xmlhttpRequest({
    method: "GET",
    url: "https://cdn.jsdelivr.net/npm/marked/marked.min.js",
    onload: (res) => {
        // 2. Evaluate marked into unsafeWindow
        const script = document.createElement("script");
        script.textContent = res.responseText;
        document.body.appendChild(script);

        waitForMarked();
    },
    onerror: () => {
        alert("Failed to load marked.js");
    }
});

// 3. Retry until marked is available
function waitForMarked(retry = 0) {
    if (typeof unsafeWindow.marked !== "undefined") {
        console.log("✅ Marked loaded");

        setupHotkeyListener();
    } else if (retry < 10) {
        setTimeout(() => waitForMarked(retry + 1), 300);
    }
}

// 4. Your logic here
function setupHotkeyListener() {
    // Add styles to document
    const styleElement = document.createElement('style');
    styleElement.textContent = styles;
    document.head.appendChild(styleElement);

    document.addEventListener('keydown', async (event) => {
        const keySelected = event.key.toLowerCase() === 'e';
        const selectedText = window.getSelection().toString().trim();

        if (keySelected && selectedText) {
            event.preventDefault();

            let apiKey = GM_getValue("GROQ_API_KEY");
            if (!apiKey) {
                apiKey = prompt("Enter your Groq API key:");
                if (!apiKey) return;
                GM_setValue("GROQ_API_KEY", apiKey);
            }
            let instructions = GM_getValue("instructions");
            if (!instructions) {
                instructions = prompt("Enter your J.D. Instructions:");
                if (!instructions) return;
                GM_setValue("instructions", instructions);
            }

            let modal = document.getElementById('groq-modal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'groq-modal';
                modal.innerHTML = `<div id="groq-modal-content">Waiting...</div>
                                   <button id="groq-modal-close">Close</button>`;
                Object.assign(modal.style, {
                    position: "fixed", top: "20%", left: "50%",
                    transform: "translateX(-50%)", background: "white", color: "black",
                    border: "2px solid #444", padding: "20px", zIndex: 9999,
                    maxWidth: "500px", boxShadow: "0 0 15px rgba(0,0,0,0.5)",
                    overflowY: "auto", maxHeight: "70%"
                });
                document.body.appendChild(modal);
                document.getElementById("groq-modal-close").onclick = () => modal.remove();
            }

            document.getElementById('groq-modal-content').textContent = "Waiting for response...";
            modal.style.display = 'block';

            GM_xmlhttpRequest({
                method: "POST",
                url: "https://api.groq.com/openai/v1/chat/completions",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`,
                },
                data: JSON.stringify({
                    model: "llama3-8b-8192",
                    messages: [
                        { role: "user", content: instructions },
                        { role: "user", content: `J.D. ${selectedText}` }]
                }),
                onload: function (response) {
                    try {
                        const data = JSON.parse(response.responseText);
                        const reply = data.choices?.[0]?.message?.content || "No response";
                        document.getElementById('groq-modal-content').innerHTML =
                            unsafeWindow.marked.parse(reply);
                    } catch (err) {
                        document.getElementById('groq-modal-content').textContent = "Error parsing response.";
                    }
                },
                onerror: function (err) {
                    document.getElementById('groq-modal-content').textContent = "API request failed.";
                }
            });
        }
    });
}
