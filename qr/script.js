const qrgInputs = document.querySelectorAll(`
  #qrg-width,#qrg-height,#qrg-data,#qrg-margin,
  #qrg-bgselector,#qrg-bgcolor,#qrg-bggradA,#qrg-bggradB,#qrg-bggradT,#qrg-bggradR,
  #qrg-qrdensity,#qrg-qrmode,#qrg-qrerror,
  #qrg-imgbgdot,#qrg-imgsize,#qrg-imgmargin,
  #qrg-dotsselector,#qrg-dotscolor,#qrg-dotsgradA,#qrg-dotsgradB,#qrg-dotsgradT,#qrg-dotsgradR,#qrg-dotstype,
  #qrg-csselector,#qrg-cscolor,#qrg-csgradA,#qrg-csgradB,#qrg-csgradT,#qrg-csgradR,#qrg-cstype,
  #qrg-cdselector,#qrg-cdcolor,#qrg-cdgradA,#qrg-cdgradB,#qrg-cdgradT,#qrg-cdgradR,#qrg-cdtype
  `);
const qrgvalues = {};
qrgInputs.forEach(input => {
  qrgvalues[input.id] = input.value;
  input.addEventListener("input", () => {
    qrgvalues[input.id] = input.value;
    console.log(`${input.id}: ${qrgvalues[input.id]}`);
    generateQR();
  });
});

let qrgImageFix;
document.getElementById("qrg-image").addEventListener("change", function (event) {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function (e) {
      qrgImageFix = e.target.result;
      generateQR();
    };
    reader.readAsDataURL(file);
  };
});

let downloadQR = function(){};

function generateQR() {

  const qrCode = new QRCodeStyling({
    width: qrgvalues['qrg-width'] || 300,
    height: qrgvalues['qrg-height'] || 300,
    type: "svg",
    data: qrgvalues['qrg-data'] || "https://app.kodejarwo.com/",
    image: qrgImageFix || "",
    margin: qrgvalues['qrg-margin'] || 0,
    qrOptions: {
      typeNumber: qrgvalues['qrg-qrdensity'] || 0, // 0 - 40
      mode: qrgvalues['qrg-qrmode'] || "", // "Numeric" "Alphanumeric" "Byte" "Kanji"
      errorCorrectionLevel: qrgvalues['qrg-qrerror'] || "Q" // "L" "M" "Q" "H"
    },
    imageOptions: {
      hideBackgroundDots: qrgvalues['qrg-imgbgdot'] || true, // boolean
      imageSize: qrgvalues['qrg-imgsize'] || 0.4,
      margin: qrgvalues['qrg-imgmargin'] || 20,
      crossOrigin: "anonymous", // "anonymous" "use-credentials"
      saveAsBlob: false // boolean
    },
    dotsOptions: {
      color: (qrgvalues['qrg-dotsselector'] === "single") ? qrgvalues['qrg-dotscolor'] : '',
      gradient: (qrgvalues['qrg-dotsselector'] === "gradient") ? {
          type: qrgvalues['qrg-dotsgradT'],
          rotation:  qrgvalues['qrg-dotsgradR'] * (Math.PI / 180) || 0,
          colorStops: [
              { offset: 0, color: qrgvalues['qrg-dotsgradA'] },
              { offset: 1, color: qrgvalues['qrg-dotsgradB'] }
          ]
      } : '',
      type: qrgvalues['qrg-dotstype'].toLowerCase() || "square", // 'rounded' 'dots' 'classy' 'classy-rounded' 'square' 'extra-rounded'
      roundSize: false // boolean
    },
    backgroundOptions: {
      color: (qrgvalues['qrg-bgselector'] === "single") ? qrgvalues['qrg-bgcolor'] : '',
      gradient: (qrgvalues['qrg-bgselector'] === "gradient") ? {
          type: qrgvalues['qrg-bggradT'],
          rotation:  qrgvalues['qrg-bggradR'] * (Math.PI / 180) || 0,
          colorStops: [
              { offset: 0, color: qrgvalues['qrg-bggradA'] },
              { offset: 1, color: qrgvalues['qrg-bggradB'] }
          ]
      } : '',
    },
    cornersSquareOptions: {
      color: (qrgvalues['qrg-csselector'] === "single") ? qrgvalues['qrg-cscolor'] : '',
      gradient: (qrgvalues['qrg-csselector'] === "gradient") ? {
          type: qrgvalues['qrg-csgradT'],
          rotation:  qrgvalues['qrg-csgradR'] * (Math.PI / 180) || 0,
          colorStops: [
              { offset: 0, color: qrgvalues['qrg-csgradA'] },
              { offset: 1, color: qrgvalues['qrg-csgradB'] }
          ]
      } : '',
      type: qrgvalues['qrg-cstype'].toLowerCase() || "" // 'dot' 'square' 'extra-rounded'
    },
    cornersDotOptions: {
      color: (qrgvalues['qrg-cdselector'] === "single") ? qrgvalues['qrg-cdcolor'] : '',
      gradient: (qrgvalues['qrg-cdselector'] === "gradient") ? {
          type: qrgvalues['qrg-cdgradT'],
          rotation:  qrgvalues['qrg-cdgradR'] * (Math.PI / 180) || 0,
          colorStops: [
              { offset: 0, color: qrgvalues['qrg-cdgradA'] },
              { offset: 1, color: qrgvalues['qrg-cdgradB'] }
          ]
      } : '',
      type: qrgvalues['qrg-cdtype'].toLowerCase() || "" // 'dot' 'square' 'extra-rounded'
    }
  });

  document.getElementById('qrg-canvas').innerHTML = "";
  qrCode.append(document.getElementById('qrg-canvas'));

  const isdotsSingle = qrgvalues['qrg-dotsselector'] === "single";
  document.getElementById("qrg-dotsselected-single").classList.toggle('hide', !isdotsSingle);
  document.getElementById("qrg-dotsselected-gradientA").classList.toggle('hide', isdotsSingle);
  document.getElementById("qrg-dotsselected-gradientB").classList.toggle('hide', isdotsSingle);

  const isbgSingle = qrgvalues['qrg-bgselector'] === "single";
  document.getElementById("qrg-bgselected-single").classList.toggle('hide', !isbgSingle);
  document.getElementById("qrg-bgselected-gradientA").classList.toggle('hide', isbgSingle);
  document.getElementById("qrg-bgselected-gradientB").classList.toggle('hide', isbgSingle);

  const iscsSingle = qrgvalues['qrg-csselector'] === "single";
  document.getElementById("qrg-csselected-single").classList.toggle('hide', !iscsSingle);
  document.getElementById("qrg-csselected-gradientA").classList.toggle('hide', iscsSingle);
  document.getElementById("qrg-csselected-gradientB").classList.toggle('hide', iscsSingle);

  const iscdSingle = qrgvalues['qrg-cdselector'] === "single";
  document.getElementById("qrg-cdselected-single").classList.toggle('hide', !iscdSingle);
  document.getElementById("qrg-cdselected-gradientA").classList.toggle('hide', iscdSingle);
  document.getElementById("qrg-cdselected-gradientB").classList.toggle('hide', iscdSingle);

  downloadQR = function() {
    let filename = document.getElementById('qrg-filename').value || "QR by Kode Jarwo";
    let fileextension = document.getElementById('qrg-fileextension').value.toLowerCase() || "png";
    qrCode.download({
        name: filename,
        extension: fileextension // 'png' 'jpeg' 'webp' 'svg'
    });
  };
  
};

generateQR();