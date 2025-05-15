let bfrInputFiles = document.getElementById('bfr-input-files');
function bfrAddFiles() {
	const files = bfrInputFiles.files;
	const newFiles = Array.from(files);
	renamedFiles = renamedFiles.concat(newFiles.map(file => ({ name: file.name, originalFile: file })));
	bfrUpdateFiles();
};

let renamedFiles = [];
let rules = [];

let bfrClearFiles = document.getElementById('bfr-files-clear'),
		bfrInsertSave = document.getElementById('bfr-insert-save'),
		bfrRemoveSave = document.getElementById('bfr-remove-save'),
		bfrReplaceSave = document.getElementById('bfr-replace-save'),
		bfrRulesRemove = document.getElementById('bfr-rules-remove');

bfrInputFiles.addEventListener('change', bfrAddFiles);
bfrClearFiles.addEventListener('click', bfrClearAllFiles);
bfrInsertSave.addEventListener('click', bfrInsert);
bfrRemoveSave.addEventListener('click', bfrRemove);
bfrReplaceSave.addEventListener('click', bfrReplace);
bfrRulesRemove.addEventListener('click', bfrRemoveAllRules);

function scrollToTopRules() {
    let viewed = document.getElementById('bfr-rules-list');
    viewed.scrollTop = 0;
}

function bfrInsert() {
	const insertText = document.getElementById('bfr-insert-text').value;
	const insertPosition = document.getElementById('bfr-insert-position').value;
	const insertOption = document.getElementById('bfr-insert-option').value;
	if (insertText) {
		const rule = { type: 'insert', text: insertText, position: parseInt(insertPosition), option: insertOption };
		rules.push(rule);
		bfrUpdateRules();
		insertText.value = '';
		insertPosition.value = '';
		bfrUpdateFiles();
	} else {
		// showMessage('Please fill in the text to insert.');
	}
    scrollToTopRules();
}

function bfrRemove() {
	const removeText = document.getElementById('bfr-remove-text').value;
	const caseSensitive = document.getElementById('bfr-remove-cs').checked;
	if (removeText) {
		const rule = { type: 'remove', text: removeText, caseSensitive };
		rules.push(rule);
		bfrUpdateRules();
		removeText.value = '';
		bfrUpdateFiles();
	} else {
		// showMessage('Please fill in the text to remove.');
	}
    scrollToTopRules();
}

function bfrReplace() {
	const from = document.getElementById('bfr-replace-from').value;
	const to = document.getElementById('bfr-replace-to').value;
	if (from && to) {
		const rule = { type: 'replace', from, to };
		rules.push(rule);
		bfrUpdateRules();
		from.value = '';
		to.value = '';
		bfrUpdateFiles();
	} else {
		// showMessage('Please fill in both fields to add a replace rule.');
	}
    scrollToTopRules();
}

function bfrUpdateRules() {
	const rulesList = document.getElementById('bfr-rules-list');
	rulesList.innerHTML = '';
	rules.forEach((rule, index) => {
		const listItem = document.createElement('div');
		if (rule.type === 'replace') {
			listItem.innerHTML = `<span>Replace</span> <span>${rule.from || ''} → ${rule.to || ''}</span>`;
		} else if (rule.type === 'insert') {
			listItem.innerHTML = `<span>Insert</span> <span>${rule.text + ' | ' + rule.option + ' <sub>(' + rule.position + ')</sub>  ' || ''}</span>`;
		} else if (rule.type === 'remove') {
			listItem.innerHTML = `<span>Remove</span> <span>${rule.text} ${rule.caseSensitive ? '<sub>(CS)</sub>' : ''}</span>`;
		}
		listItem.dataset.index = index;
		const checkbox = document.createElement('span');
		checkbox.setAttribute("onclick", "bfrRemoveSelectedRules()");
		checkbox.innerHTML = `<input type="checkbox"/><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"> <path d="M16 8L8 16M8 8L16 16" stroke-width="2" stroke-linecap="round"/> </svg>`;
		listItem.append(checkbox);
		rulesList.appendChild(listItem);
	});
	bfrRulesRemove.style.display = rules.length > 0 ? 'block' : 'none';
    scrollToTopRules();
}

function bfrRemoveSelectedRules() {
	const selectedCheckboxes = document.querySelectorAll('#bfr-rules-list input[type="checkbox"]:checked');
	const indicesToRemove = Array.from(selectedCheckboxes).map(checkbox => {
		const listItem = checkbox.closest('div');
		return parseInt(listItem.dataset.index);
	});
	rules = rules.filter((rule, index) => !indicesToRemove.includes(index));
	bfrUpdateRules();
	bfrUpdateFiles();
    scrollToTopRules();
}

function bfrRemoveAllRules() {
	document.querySelectorAll('#bfr-rules-list input[type="checkbox"]').forEach(checkbox => {
		checkbox.checked = true;
	})
	bfrRemoveSelectedRules();
    scrollToTopRules();
}

function bfrUpdateFiles() {
	const tbody = document.getElementById('bfr-files-table');
	tbody.innerHTML = '';
	renamedFiles.forEach(file => {
		const fileName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
		const fileExt = file.name.substring(file.name.lastIndexOf('.'));
		let newFileName = fileName;
		rules.forEach(rule => {
			if (rule.type === 'insert') {
				const position = rule.position - 1;
				const words = newFileName.split(' ');
				if (rule.option === 'Prefix') {
					if (position >= 0 && position < words.length) {
						words.splice(position, 0, rule.text);
					}
				} else if (rule.option === 'Suffix') {
					if (position >= 0 && position < words.length) {
						words.splice(words.length - position, 0, rule.text);
					}
				}
				newFileName = words.join(' ');
			} else if (rule.type === 'remove') {
				if (rule.caseSensitive) {
					newFileName = newFileName.replace(new RegExp(rule.text, 'g'), '');
				} else {
					newFileName = newFileName.replace(new RegExp(rule.text, 'gi'), '');
				}
			} else if (rule.type === 'replace') {
				newFileName = newFileName.replace(new RegExp(rule.from, 'g'), rule.to);
			}
		});
		file.newName = newFileName + fileExt;
		const row = tbody.insertRow();
		const originalCell = row.insertCell(0);
		const renamedCell = row.insertCell(1);
		const selectCell = row.insertCell(2);
		selectCell.setAttribute("onclick", "bfrRemoveSelectedFiles()");
		selectCell.innerHTML = `<input type='checkbox'/><svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"> <path d="M16 8L8 16M8 8L16 16" stroke-width="2" stroke-linecap="round"/> </svg>`;
		originalCell.textContent = file.name;
		renamedCell.textContent = file.newName;
	});
	document.getElementById('bfr-files-empty').style.display = 'none';
	document.getElementById('bfr-files-tables').style.display = renamedFiles.length > 0 ? 'block' : 'none';
	document.getElementById('bfr-files-download').style.display = renamedFiles.length > 0 ? 'grid' : 'none';
	document.getElementById('bfr-files-clear').style.display = renamedFiles.length > 0 ? 'grid' : 'none';
}

function bfrClearAllFiles() {
	renamedFiles = [];
	document.getElementById('bfr-files-table').innerHTML = '';
	rules = [];
	bfrUpdateRules();
	document.getElementById('bfr-files-empty').style.display = 'block';
	document.getElementById('bfr-files-tables').style.display = 'none';
	document.getElementById('bfr-files-download').style.display = 'none';
	document.getElementById('bfr-files-clear').style.display = 'none';
}

function bfrRemoveSelectedFiles() {
	const selectedCheckboxes = document.querySelectorAll('#bfr-files-table input[type="checkbox"]:checked');
	const filesToRemove = Array.from(selectedCheckboxes).map(checkbox => {
		const row = checkbox.closest('tr');
		const originalFileName = row.cells[1].textContent;
		return renamedFiles.find(file => file.name === originalFileName);
	});
	renamedFiles = renamedFiles.filter(file => !filesToRemove.includes(file));
	bfrUpdateFiles();
};

document.getElementById('bfr-files-download').onclick = () => {
	renamedFiles.forEach(file => {
		const blob = new Blob([file.originalFile], { type: file.originalFile.type });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = file.newName || file.name;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	});
};

document.querySelectorAll('.rule-insert, .rule-remove, .rule-replace').forEach(rule => {
	rule.addEventListener('click', () => {
		document.querySelectorAll('.rule-insert, .rule-remove, .rule-replace, .set-insert, .set-remove, .set-replace').forEach(el => el.classList.remove('active'));
		rule.classList.add('active');
		document.querySelector(`.set-${rule.classList[0].split('-')[1]}`).classList.add('active');
	});
});