let iwmupload = document.getElementById('input-files');
let iwmcanvas = document.getElementById('canvas');
let imwuploadedImage = new Image();
iwmupload.addEventListener('change', (e) => {
  document.querySelector('.output').style.display = "flex";
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (event) => {
      imwuploadedImage.src = event.target.result;
      imwuploadedImage.onload = () => {
        iwmcanvas.width = imwuploadedImage.width;
        iwmcanvas.height = imwuploadedImage.height;
        posX = iwmcanvas.width / 2;
        posY = iwmcanvas.height / 2;
        drawImageWithWatermark();
      };
    };
    reader.readAsDataURL(file);
  }
});

let iwmctx = iwmcanvas.getContext('2d');
let iwmdownload = document.getElementById('download');

let textWatermark = '';
let posX = 0, posY = 0;
let isDragging = false;

const updateWatermark = () => {
  textWatermark = document.getElementById('text').value;
  drawImageWithWatermark();
};

document.getElementById('text').addEventListener('input', updateWatermark);
document.getElementById('font-family').addEventListener('change', updateWatermark);
document.getElementById('font-weight').addEventListener('change', updateWatermark);
document.getElementById('font-size').addEventListener('input', updateWatermark);
document.getElementById('font-color').addEventListener('input', updateWatermark);
document.getElementById('font-underline').addEventListener('input', updateWatermark);
document.getElementById('font-strikethrough').addEventListener('input', updateWatermark);
document.getElementById('font-opacity').addEventListener('input', updateWatermark);
document.getElementById('font-rotation').addEventListener('input', updateWatermark);

function drawImageWithWatermark() {
  iwmctx.clearRect(0, 0, iwmcanvas.width, iwmcanvas.height);
  iwmctx.drawImage(imwuploadedImage, 0, 0);

  const fontSize = document.getElementById('font-size').value;
  const fontFamily = document.getElementById('font-family').value;
  const fontWeight = document.getElementById('font-weight').value;
  const color = document.getElementById('font-color').value;
  const opacity = document.getElementById('font-opacity').value;
  const rotation = document.getElementById('font-rotation').value;
  const underline = document.getElementById('font-underline').checked;
  const strikethrough = document.getElementById('font-strikethrough').checked;

  iwmctx.save();
  iwmctx.globalAlpha = opacity;
  iwmctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  const textWidth = iwmctx.measureText(textWatermark).width;
  const textHeight = parseInt(fontSize, 10);
  iwmctx.translate(posX, posY);
  iwmctx.rotate(rotation * Math.PI / 180);
  iwmctx.fillStyle = color;

  iwmctx.fillText(textWatermark, -textWidth / 2, textHeight / 4);

  if (underline) {
    iwmctx.beginPath();
    iwmctx.moveTo(-textWidth / 2, textHeight / 4 + 5);
    iwmctx.lineTo(textWidth / 2, textHeight / 4 + 5);
    iwmctx.strokeStyle = color;
    iwmctx.lineWidth = 2;
    iwmctx.stroke();
  }

  if (strikethrough) {
    iwmctx.beginPath();
    iwmctx.moveTo(-textWidth / 2, textHeight / 4 - textHeight / 2);
    iwmctx.lineTo(textWidth / 2, textHeight / 4 - textHeight / 2);
    iwmctx.strokeStyle = color;
    iwmctx.lineWidth = 2;
    iwmctx.stroke();
  }

  iwmctx.restore();

  iwmdownload.href = iwmcanvas.toDataURL('image/png');
  iwmdownload.download = 'watermarked_image.png';
  iwmdownload.style.display = 'block';
  iwmdownload.innerText = 'Download';
}

iwmcanvas.addEventListener('mousedown', (e) => {
  isDragging = true;
  document.body.classList.add('c-grabbing');
});

iwmcanvas.addEventListener('mousemove', (e) => {
  if (isDragging) {
    const rect = iwmcanvas.getBoundingClientRect();
    posX = e.clientX - rect.left;
    posY = e.clientY - rect.top;
    drawImageWithWatermark();
  }
});

iwmcanvas.addEventListener('mouseup', () => {
  isDragging = false;
  document.body.classList.remove('c-grabbing');
});

iwmcanvas.addEventListener('mouseleave', () => {
  isDragging = false;
  document.body.classList.remove('c-grabbing');
});