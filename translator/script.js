function updateLanguageOptions() {
  const inputSelect = document.querySelector('.input.lang-select select');
  const outputSelect = document.querySelector('.output.lang-select select');
  const inVal = inputSelect.value;
  const outVal = outputSelect.value;
  Array.from(outputSelect.options).forEach(o => {
    o.disabled = o.value === inVal;
  });
  Array.from(inputSelect.options).forEach(o => {
    o.disabled = o.value === outVal;
  });
}

document.querySelector('.input.lang-select select').addEventListener('change', updateLanguageOptions);
document.querySelector('.output.lang-select select').addEventListener('change', updateLanguageOptions);
updateLanguageOptions();

async function translate() {
  const inputLang = document.querySelector('.input.lang-select select').value;
  const outputLang = document.querySelector('.output.lang-select select').value;
  const outputPolite = document.querySelector('.set.polite-select select').value;
  const inputText = document.querySelector('#text-input').value;
  const resultsEl = document.querySelector('#text-output');
  resultsEl.textContent = 'Translating...';
  const query = `Please translate the following sentence from ${encodeURIComponent(inputLang)} into proper and correct ${encodeURIComponent(outputLang)}, with a polite level of ${encodeURIComponent(outputPolite)}, and give me only the translation, without any additional sentences (e.g. opening or closing), I only want you to answer the translation. Here is the sentence you have to translate: [${encodeURIComponent(inputText)}]`;
  const url = `https://text.pollinations.ai/${query}`;
  try {
    const res = await fetch(url);
    resultsEl.textContent = await res.text();
  } catch (e) {
    resultsEl.textContent = 'Terjadi kesalahan dalam mengambil terjemahan.';
  }
}

document.querySelector('.translate').addEventListener('click', translate);

function copyHandler(btn, getter) {
  if (!btn) return;
  btn.addEventListener('click', () => {
    navigator.clipboard.writeText(getter()).then(() => {
      btn.classList.add('done');
      setTimeout(() => btn.classList.remove('done'), 3000);
    });
  });
}

copyHandler(document.querySelector('.input-wrapper .copy-text'), () => document.querySelector('#text-input').value);
copyHandler(document.querySelector('.output-wrapper .copy-text'), () => document.querySelector('#text-output').textContent);

document.querySelector('.swap').addEventListener('click', () => {
  const inSel = document.querySelector('.input.lang-select select');
  const outSel = document.querySelector('.output.lang-select select');
  const tempLang = inSel.value;
  inSel.value = outSel.value;
  outSel.value = tempLang;
  const inTxt = document.querySelector('#text-input');
  const outTxt = document.querySelector('#text-output');
  const tempTxt = inTxt.value;
  inTxt.value = outTxt.textContent;
  outTxt.textContent = tempTxt;
  updateLanguageOptions();
});

const textarea = document.querySelector('#text-input');
const div = document.querySelector('#text-output');

textarea.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = this.scrollHeight + 'px';
    div.style.height = this.scrollHeight + 'px';
});

textarea.dispatchEvent(new Event('input'));