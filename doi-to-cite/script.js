// DOI to APA

document.getElementById('form').addEventListener('submit', async function (event) {
    event.preventDefault();
  
    const doiList = document.getElementById('doi').value.trim().split('\n').map(doi => doi.trim());
    const citationList = document.getElementById('list');
    const dtaOutput = document.querySelector(".output");
  
    dtaOutput.classList.remove('hide');
    citationList.innerHTML = ''; 
  
    for (const doi of doiList) {
      if (doi) {
        try {
          const data = await fetchCitation(doi);
          citationList.appendChild(displayCitation(data.message));
        } catch (error) {
          const errorItem = document.createElement('div');
          errorItem.className = 'error';
          errorItem.textContent = error.message;
          citationList.appendChild(errorItem);
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  });
  
  async function fetchCitation(doi) {
    const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
    if (!response.ok) throw new Error(`Article not found for: ${doi}`);
    return response.json();
  }
  
  function displayCitation(item) {
    const authors = item.author.map((author, index) => {
      // Format penulis pertama dengan format: "Nama Belakang Inisial."
      if (index === 0) {
        return `${author.family} ${author.given.charAt(0)}.`;
      } 
      // Format penulis kedua dan seterusnya dengan format: "Inisial. Nama Belakang"
      return `${author.given.charAt(0)}. ${author.family}`;
    });
  
    let formattedAuthors;
    if (authors.length === 1) {
      formattedAuthors = authors[0];
    } else if (authors.length === 2) {
      formattedAuthors = authors.join(' & ');
    } else {
      const lastAuthor = authors.pop(); // Ambil penulis terakhir
      formattedAuthors = authors.join(', ') + ', & ' + lastAuthor; // Gabungkan dengan ', & '
    }
  
    const year = item['published-print'] ? item['published-print']['date-parts'][0][0] : 'Year not available';
    const title = item.title[0].replace(/<[^>]*>/g, '');
    const journal = item['container-title'][0].replace(/<[^>]*>/g, '');
    const volume = item.volume ? item.volume : '';
    const issue = item.issue ? item.issue : '';
    const page = item.page ? item.page : '';
    const URL = item.URL ? item.URL : '';
  
    const citation = `${formattedAuthors}. ${year}. ${title}. ${journal}, ${volume}${issue ? `(${issue})` : ''}, ${page}. ${URL}`;
  
    const citationItem = document.createElement('div');
    citationItem.className = 'citation';
    citationItem.textContent = citation.replace("Year not available. ", "").replace("..", ".");
  
    const infoDiv = document.createElement('div');
    infoDiv.className = 'info';
    infoDiv.innerHTML = `
      <span>Title: ${title}</span>
      <span>Authors: ${formattedAuthors}</span>
      <span>Year: ${year}</span>
      <span>Journal: ${journal}</span>
      <span>Volume: ${volume}</span>
      <span>Issue: ${issue}</span>
      <span>Page: ${page}</span>
      <span>Publisher: ${item.publisher}</span>
      <span>ISSN: ${item.ISSN}</span>
      <span>DOI: ${item.DOI}</span>
    `.trim();
  
    citationItem.addEventListener('click', function () {
      infoDiv.style.display = infoDiv.style.display === 'none' || infoDiv.style.display === '' ? 'block' : 'none';
    });
  
    const output = document.createElement('div');
    output.appendChild(citationItem);
    output.appendChild(infoDiv);
    return output;
  }