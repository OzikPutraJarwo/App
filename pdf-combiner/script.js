const pdfInput = document.getElementById('input-files');
const fileList = document.getElementById('file-list');
const combineBtn = document.getElementById('combine');
const outputFileName = document.getElementById('file-name');
let files = [];
let thumbnails = [];
pdfInput.addEventListener('change', async (event) => {
  fileList.innerHTML = "Loading...";
  const newFiles = Array.from(event.target.files);
  for (const file of newFiles) {
    files.push(file);
    const thumbnailSrc = await createThumbnail(file);
    thumbnails.push(thumbnailSrc);
  }
  displayFiles();
  combineBtn.disabled = files.length === 0;
});

function displayFiles() {
  fileList.innerHTML = '';
  for (let i = 0; i < files.length; i++) {
    if (thumbnails[i] === undefined) {
      continue;
    }

    const fileItem = document.createElement('div');
    fileItem.className = 'file-item';

    fileItem.innerHTML = `
            <img src="${thumbnails[i]}" class="thumbnail" alt="Thumbnail">
            <span>${files[i].name}</span>
            <div>
                <button onclick="moveFile(${i}, -1)"><svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 13l-6-6-6 6"/> </svg></button>
                <button onclick="moveFile(${i}, 1)"><svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7l6 6 6-6"/> </svg></button>
                <button onclick="removeFile(${i})"><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"> <path d="M16 8L8 16M8 8L16 16" stroke-width="2" stroke-linecap="round"/></button>
            </div>
        `;
    fileList.appendChild(fileItem);
  }
}

async function createThumbnail(file) {
  const pdfData = await file.arrayBuffer();
  const pdfDoc = await pdfjsLib.getDocument({ data: pdfData }).promise;
  const page = await pdfDoc.getPage(1);
  const viewport = page.getViewport({ scale: 1 });

  const scale = 200 / Math.max(viewport.width, viewport.height);
  const scaledViewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = scaledViewport.width;
  canvas.height = scaledViewport.height;
  const context = canvas.getContext('2d');

  const renderContext = {
    canvasContext: context,
    viewport: scaledViewport,
  };
  await page.render(renderContext).promise;
  return canvas.toDataURL();
}

function moveFile(index, direction) {
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= files.length) return;

  [files[index], files[newIndex]] = [files[newIndex], files[index]];
  [thumbnails[index], thumbnails[newIndex]] = [thumbnails[newIndex], thumbnails[index]];
  displayFiles();
}

function removeFile(index) {
  files.splice(index, 1);
  thumbnails.splice(index, 1);
  displayFiles();
  combineBtn.disabled = files.length === 0;
}

combineBtn.addEventListener('click', async () => {
  files = files.filter((_, index) => thumbnails[index] !== undefined);
  thumbnails = thumbnails.filter(thumbnail => thumbnail !== undefined);

  if (files.length === 0) {
    // showMessage("Upload file first!");
    return;
  }

  const pdfDoc = await PDFLib.PDFDocument.create();
  pdfDoc.setTitle('App by Kode Jarwo');
  pdfDoc.setAuthor('App by Kode Jarwo');

  for (const file of files) {
    const fileData = await file.arrayBuffer();
    const pdfToMerge = await PDFLib.PDFDocument.load(fileData);
    const copiedPages = await pdfDoc.copyPages(pdfToMerge, pdfToMerge.getPageIndices());
    copiedPages.forEach((page) => pdfDoc.addPage(page));
  }

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = outputFileName.value || 'combined.pdf';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});