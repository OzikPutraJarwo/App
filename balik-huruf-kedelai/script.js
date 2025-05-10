function reverseText() {
  const input = document.getElementById('inputText').value;
  const isVertical = input.includes('\n');
  const chars = isVertical ? input.split('\n').map(char => char.trim()) : input.split(/\s+/);
  const uniqueChars = [...new Set(chars)];
  uniqueChars.sort();
  const mapping = {};
  const numChars = uniqueChars.length;
  // mapping besar ke kecil
  for (let i = 0; i < numChars; i++) {
      mapping[uniqueChars[i]] = uniqueChars[numChars - 1 - i];
  }
  const output = chars.map(char => mapping[char] || char).join(isVertical ? '\n' : ' ');
  document.getElementById('outputText').value = output;
}