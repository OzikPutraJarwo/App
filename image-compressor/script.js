const Upload = document.getElementById('input-files');
const Original = document.querySelector('.image-container.original');
const OriginalImage = document.getElementById('OriginalImage');
const OriginalInfo = document.getElementById('OriginalInfo');
const OriginalFileSize = document.getElementById('OriginalFileSize');
let OriginalImg = null;
let OriginalFileType = null;
Upload.addEventListener('change', (event) => {
  document.querySelector('.output').style.display = 'block';
  const file = event.target.files[0];
  OriginalFileType = file.type;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      OriginalImg = img;
      Original.style.display = 'block';
      OriginalImage.src = e.target.result;
      OriginalInfo.innerText = `Dimensions: ${img.width} × ${img.height} px`;
      OriginalInfo.style.display = 'block';
      OriginalFileSize.innerText = `File size: ${(file.size / 1024).toFixed(2)} KB`;
      OriginalFileSize.style.display = 'block';
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
});

const DownloadLink = document.getElementById('Download');
const ResultImage = document.getElementById('ResultImage');
const ResultInfo = document.getElementById('ResultInfo');
const ResultFileSize = document.getElementById('ResultFileSize');
const Results = document.querySelector('.image-container.results');

document.getElementById('ResizeBtn').addEventListener('click', () => {
  if (!OriginalImg) return;

  const widthPercent = parseInt(document.getElementById('Width').value);
  const heightPercent = parseInt(document.getElementById('Height').value);
  const quality = parseFloat(document.getElementById('Quality').value);

  const newWidth = OriginalImg.width * (widthPercent / 100);
  const newHeight = OriginalImg.height * (heightPercent / 100);

  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');
  tempCanvas.width = newWidth;
  tempCanvas.height = newHeight;
  tempCtx.drawImage(OriginalImg, 0, 0, newWidth, newHeight);

  const resizedDataUrl = tempCanvas.toDataURL(OriginalFileType, quality);
  DownloadLink.href = resizedDataUrl;
  DownloadLink.download = `resized-image.${OriginalFileType.split('/')[1]}`;
  DownloadLink.style.display = 'block';
  DownloadLink.innerText = 'Download';

  const byteString = atob(resizedDataUrl.split(',')[1]);
  const byteNumbers = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) {
    byteNumbers[i] = byteString.charCodeAt(i);
  }
  const blob = new Blob([byteNumbers], { type: OriginalFileType });
  const fileSize = blob.size / 1024;

  ResultImage.src = resizedDataUrl;
  ResultInfo.innerText = `Dimensions: ${newWidth} x ${newHeight} px`;
  ResultFileSize.innerText = `File size: ${fileSize.toFixed(2)} KB`;

  Results.style.display = 'block';
});