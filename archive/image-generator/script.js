let lastSeedValue = null;

document.querySelector('#generate').addEventListener('click', function() {
    const prompt = document.querySelector('#prompt').value;
    const width = document.querySelector('#width').value;
    const height = document.querySelector('#height').value;
    const seed = document.querySelector('#seed').value;
    const model = document.querySelector('#model').value;
    const negativePrompt = document.querySelector('#negative-prompt').value;
    const logo = document.querySelector('#logo').checked;
    const safe = document.querySelector('#safe').checked;
    const enhance = document.querySelector('#enhance').checked;

    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${seed}&model=${model}&negative_prompt=${encodeURIComponent(negativePrompt)}&nologo=${!logo}&safe=${safe}&enhance=${enhance}`;

    document.querySelector('.output').innerHTML = `<img src="${imageUrl}" alt="${prompt}" />`;
    document.querySelector('#generate').setAttribute('disabled', 'true');
    document.querySelector('#regenerate').removeAttribute('disabled');
});

document.querySelectorAll('#prompt, #width, #height, #seed, #model, #negative-prompt, #logo, #safe, #enhance').forEach(input => {
    input.addEventListener('input', function() {
        document.querySelector('#generate').removeAttribute('disabled');
        document.querySelector('#regenerate').setAttribute('disabled', 'true');
    });
});

document.querySelector('#regenerate').addEventListener('click', function() {
    const prompt = document.querySelector('#prompt').value;
    const width = document.querySelector('#width').value;
    const height = document.querySelector('#height').value;
    const model = document.querySelector('#model').value;
    const negativePrompt = document.querySelector('#negative-prompt').value;
    const logo = document.querySelector('#logo').checked;
    const safe = document.querySelector('#safe').checked;
    const enhance = document.querySelector('#enhance').checked;

    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${lastSeedValue}&model=${model}&negative_prompt=${encodeURIComponent(negativePrompt)}&nologo=${!logo}&safe=${safe}&enhance=${enhance}`;

    document.querySelector('.output').innerHTML = `<img src="${imageUrl}" alt="${prompt}" />`;
    lastSeedValue += 1;
    document.querySelector('#seed').value = lastSeedValue;
});