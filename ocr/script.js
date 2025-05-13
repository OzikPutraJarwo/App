const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const imagePreview = document.getElementById('imagePreview');
const processBtn = document.getElementById('processBtn');
const resultDiv = document.getElementById('result');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const statusText = document.getElementById('statusText');
const languageSelect = document.getElementById('language');
const outputContainer = document.getElementById('output');

uploadArea.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file && file.type.match('image.*')) {
        const reader = new FileReader();
        reader.onload = (event) => {
            imagePreview.src = event.target.result;
            imagePreview.style.display = 'block';
            processBtn.disabled = false;
        };
        reader.readAsDataURL(file);
    }
});
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.style.backgroundColor = '#f0f8ff';
});
uploadArea.addEventListener('dragleave', () => {
    uploadArea.style.backgroundColor = '';
});
uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.style.backgroundColor = '';
    const file = e.dataTransfer.files[0];
    if (file && file.type.match('image.*')) {
        fileInput.files = e.dataTransfer.files;
        const reader = new FileReader();
        reader.onload = (event) => {
            imagePreview.src = event.target.result;
            imagePreview.style.display = 'block';
            processBtn.disabled = false;
        };
        reader.readAsDataURL(file);
    }
});
processBtn.addEventListener('click', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    resultDiv.textContent = '';
    progressContainer.style.display = 'block';
    progressBar.value = 0;
    statusText.textContent = 'Mempersiapkan...';
    processBtn.disabled = true;
    const selectedLanguage = languageSelect.value;
    try {
        let result;
        
        if (selectedLanguage === 'auto') {
            statusText.textContent = 'Detecting language...';
            const commonLanguages = ['eng', 'spa', 'fra', 'deu', 'por', 'rus', 'chi_sim', 'jpn', 'kor', 'ara'];
            for (const lang of commonLanguages) {
                try {
                    statusText.textContent = `Trying ${lang}...`;
                    const tempResult = await Tesseract.recognize(
                        file,
                        lang,
                        {
                            logger: m => {
                                if (m.status === 'recognizing text') {
                                    progressBar.value = m.progress * 50; 
                                }
                            }
                        }
                    );
                    
                    if (tempResult.data.text.trim().length > 10) {
                        result = tempResult;
                        statusText.textContent = `Language detected: ${lang}`;
                        break;
                    }
                } catch (e) {
                    console.log(`Failed with ${lang}:`, e);
                }
            }
            
            if (!result) {
                statusText.textContent = 'Using English as fallback...';
                result = await Tesseract.recognize(
                    file,
                    'eng',
                    {
                        logger: m => {
                            if (m.status === 'recognizing text') {
                                progressBar.value = 50 + (m.progress * 50);
                            }
                            statusText.textContent = m.status;
                        }
                    }
                );
            }
        } else {
            result = await Tesseract.recognize(
                file,
                selectedLanguage,
                {
                    logger: m => {
                        if (m.status === 'recognizing text') {
                            progressBar.value = m.progress * 100;
                        }
                        statusText.textContent = m.status;
                    }
                }
            );
        }
        
        resultDiv.textContent = result.data.text;
    } catch (err) {
        console.error(err);
        resultDiv.textContent = 'An error occurred while processing the image: ' + err.message;
    } finally {
        progressContainer.style.display = 'none';
        outputContainer.style.display = 'flex';
        processBtn.disabled = false;
    }
});