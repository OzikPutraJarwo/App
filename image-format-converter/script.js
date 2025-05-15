const icvFileInput = document.getElementById('input-files');
let icvFiles;
icvFileInput.addEventListener('change', () => {
  icvFiles = icvFileInput.files;
});

const icvFormatSelect = document.getElementById('format-select');
const icvConvertButton = document.getElementById('convert-button');
const icvDownloadAllButton = document.getElementById('download-all-button');
const icvMainContainer = document.getElementById('main-container');
const icvSummaryContainer = document.getElementById('summary-container');
const icvConvertedFiles = [];
let icvTotalOriginalSize = 0;
let icvTotalConvertedSize = 0;

icvFileInput.addEventListener('change', () => {
    icvMainContainer.innerHTML = ''; 
    icvConvertedFiles.length = 0; 
    icvTotalOriginalSize = 0; 

    for (const icvFile of icvFiles) {
        icvTotalOriginalSize += icvFile.size;
        const icvFileContainer = document.createElement('div');
        icvFileContainer.className = 'fileContainer';
        icvFileContainer.classList.add('item');

        const icvThumb = document.createElement('img');
        icvThumb.src = URL.createObjectURL(icvFile);

        const icvTitle = document.createElement('div');
        icvTitle.className = `file-title`;
        icvTitle.innerText = icvFile.name.split('.').slice(0, -1).join('.');
        
        const icvOriginalExt = document.createElement('div');
        icvOriginalExt.className = `file-ext`;
        icvOriginalExt.innerText = icvFile.name.split('.').pop().toUpperCase();
        
        const icvOriginalSizeDiv = document.createElement('div');
        icvOriginalSizeDiv.className = `file-originsize`;
        icvOriginalSizeDiv.innerText = `${Math.round(icvFile.size / 1024)} KB`;

        icvFileContainer.appendChild(icvThumb);
        icvFileContainer.appendChild(icvTitle);
        icvFileContainer.appendChild(icvOriginalExt);
        icvFileContainer.appendChild(icvOriginalSizeDiv);
        icvFileContainer.appendChild(document.createElement('div'));
        icvFileContainer.appendChild(document.createElement('div'));
        icvFileContainer.appendChild(document.createElement('div'));
        icvFileContainer.appendChild(document.createElement('div'));

        icvMainContainer.appendChild(icvFileContainer);
    }
});

icvConvertButton.addEventListener('click', async () => {
    const icvFiles = icvFileInput.files;
    const icvFormat = icvFormatSelect.value;

    const icvFileContainers = icvMainContainer.querySelectorAll('.fileContainer');
    icvFileContainers.forEach(container => {
        while (container.children.length > 4) {
            container.removeChild(container.lastChild);
        }
    });

    for (let index = 0; index < icvFileContainers.length; index++) {
        const icvFileContainer = icvFileContainers[index];
        const icvFile = icvFiles[index];
        const icvImg = new Image();
        icvImg.src = URL.createObjectURL(icvFile);

        await new Promise((resolve) => {
            icvImg.onload = async () => {
                const icvCanvas = document.createElement('canvas');
                icvCanvas.width = icvImg.width;
                icvCanvas.height = icvImg.height;
                const icvCtx = icvCanvas.getContext('2d');
                icvCtx.drawImage(icvImg, 0, 0);
                const icvConvertedBlob = await new Promise((resolve) => {
                    icvCanvas.toBlob((blob) => resolve(blob), `image/${icvFormat}`);
                });
                const icvConvertedFile = new File([icvConvertedBlob], icvFile.name.replace(/\.\w+$/, `.${icvFormat}`), { type: `image/${icvFormat}` });
                icvConvertedFiles.push(icvConvertedFile); 
                icvTotalConvertedSize += icvConvertedFile.size; 

                const icvOriginalSize = icvFile.size;
                const icvConvertedSize = icvConvertedFile.size;
                const icvSizeDifference = ((icvOriginalSize - icvConvertedSize) / icvOriginalSize * 100).toFixed(2);
                const icvSizeClass = icvSizeDifference >= 0 ? 'green' : 'red';

                const icvSeparator = document.createElement('div');
                icvSeparator.className = `separator`;
                icvSeparator.innerText = `→`;

                const icvConvertedExt = document.createElement('div');
                icvConvertedExt.className = `file-convext`;
                icvConvertedExt.innerText = icvConvertedFile.name.split('.').pop().toUpperCase();
                const icvConvertedSizeDiv = document.createElement('div');
                icvConvertedSizeDiv.className = `file-convsize`;
                icvConvertedSizeDiv.innerText = `${Math.round(icvConvertedSize / 1024)} KB`;
                const icvPercentage = document.createElement('div');
                icvPercentage.className = `file-percentage ${icvSizeClass}`;
                icvPercentage.innerText = `${icvSizeDifference}%`;
                
                const icvDownloadButton = document.createElement('button');
                icvDownloadButton.className = `file-download btn`;
                icvDownloadButton.innerHTML = `<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg"> <g> <path d="M90,54a5.9966,5.9966,0,0,0-6,6V78H12V60A6,6,0,0,0,0,60V84a5.9966,5.9966,0,0,0,6,6H90a5.9966,5.9966,0,0,0,6-6V60A5.9966,5.9966,0,0,0,90,54Z"></path> <path d="M43.7578,64.2422a5.9979,5.9979,0,0,0,8.4844,0l18-18a5.9994,5.9994,0,0,0-8.4844-8.4844L54,45.5156V12a6,6,0,0,0-12,0V45.5156l-7.7578-7.7578a5.9994,5.9994,0,0,0-8.4844,8.4844Z"></path> </g> </svg>`;
                icvDownloadButton.onclick = () => downloadFile(icvConvertedBlob, icvConvertedFile.name);
                
                icvFileContainer.appendChild(icvSeparator);
                icvFileContainer.appendChild(icvConvertedExt);
                icvFileContainer.appendChild(icvConvertedSizeDiv);
                icvFileContainer.appendChild(icvPercentage);
                icvFileContainer.appendChild(icvDownloadButton);

                resolve();
            };
        });
    }

    displaySummary(icvTotalOriginalSize, icvTotalConvertedSize);

    icvDownloadAllButton.removeAttribute('hidden');
});

const displaySummary = (originalSize, convertedSize) => {
    icvSummaryContainer.innerHTML = ''; 

    const icvTotalOriginalSizeDiv = document.createElement('div');
    icvTotalOriginalSizeDiv.className = `all-originsize`;
    icvTotalOriginalSizeDiv.innerHTML = `<span>Total Original Size:</span></span>${Math.round(originalSize / 1024)} KB</span>`;

    const icvTotalConvertedSizeDiv = document.createElement('div');
    icvTotalConvertedSizeDiv.className = `all-convsize`;
    icvTotalConvertedSizeDiv.innerHTML = `<span>Total Converted Size:</span></span>${Math.round(convertedSize / 1024)} KB</span>`;

    const icvSizeDifference = originalSize - convertedSize;
    const icvDifferenceDiv = document.createElement('div');
    icvDifferenceDiv.className = `all-diff`;
    icvDifferenceDiv.innerHTML = `<span>Size Difference:</span></span>${Math.round(icvSizeDifference / 1024)} KB</span>`;

    const icvDifferencePercentage = ((icvSizeDifference / originalSize) * 100).toFixed(2);
    const icvDifferenceClass = icvDifferencePercentage >= 0 ? 'green' : 'red';
    const icvPercentageDiv = document.createElement('div');
    icvPercentageDiv.className = `all-percentage ${icvDifferenceClass}`;
    icvPercentageDiv.innerHTML = `<span>Percentage Saved:</span></span>${icvDifferencePercentage}%</span>`;

    icvSummaryContainer.appendChild(icvTotalOriginalSizeDiv);
    icvSummaryContainer.appendChild(icvTotalConvertedSizeDiv);
    icvSummaryContainer.appendChild(icvDifferenceDiv);
    icvSummaryContainer.appendChild(icvPercentageDiv);
    icvSummaryContainer.removeAttribute('hidden');
};

const downloadFile = (file, filename) => {
  const icvLink = document.createElement('a');
  icvLink.href = URL.createObjectURL(file);
  icvLink.download = filename;
  document.body.appendChild(icvLink);
  icvLink.click();
  document.body.removeChild(icvLink);
};

icvDownloadAllButton.addEventListener('click', () => {
  icvConvertedFiles.forEach((icvFile) => {
      downloadFile(icvFile, icvFile.name);
  });
});