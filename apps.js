const pdfInput = document.getElementById('pdfInput');
const textInput = document.getElementById('textInput');
const searchBtn = document.getElementById('searchBtn');
const statusMessage = document.getElementById('statusMessage');
const reportTable = document.getElementById('reportTable');

let pdfData = null;
let searchTerms = [];

function updateSearchButtonState() {
  searchBtn.disabled = !(pdfData && searchTerms.length > 0);
}

pdfInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const arrayBuffer = await file.arrayBuffer();
  pdfData = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  updateSearchButtonState();
});

textInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  searchTerms = text.split("\n").map(line => line.trim()).filter(Boolean);
  updateSearchButtonState();
});

searchBtn.addEventListener('click', async () => {
  if (!pdfData || searchTerms.length === 0) return;

  searchBtn.disabled = true;
  statusMessage.textContent = "🔍 Searching...";
  statusMessage.style.color = "blue";

  const results = [];
  const pageHeadings = await extractPageTopLines(pdfData, 3);

  for (let termIndex = 0; termIndex < searchTerms.length; termIndex++) {
    const term = searchTerms[termIndex];
    const termLower = term.toLowerCase();
    for (let pageNum = 1; pageNum <= pdfData.numPages; pageNum++) {
      const page = await pdfData.getPage(pageNum);
      const textContent = await page.getTextContent();

      let lines = [];
      let currentLine = "";
      let lastY = null;

      textContent.items.forEach(item => {
        const y = item.transform[5];
        if (lastY === null || Math.abs(y - lastY) < 5) {
          currentLine += item.str + " ";
        } else {
          lines.push(currentLine.trim());
          currentLine = item.str + " ";
        }
        lastY = y;
      });

      if (currentLine.trim()) lines.push(currentLine.trim());

      lines.forEach((line, idx) => {
      if (line.toLowerCase().includes(termLower)) {
      // Try to find "Remarks" from the same line or nearby lines
      let remarks = "";

      // Check same line
      const match = line.match(/remarks\s*[:\-–]\s*(.*)/i);
      if (match) {
        remarks = match[1].trim();
      } else {
        // Check next 2 lines for remarks
        for (let offset = 1; offset <= 2; offset++) {
          const nextLine = lines[idx + offset];
          if (nextLine && /remarks\s*[:\-–]/i.test(nextLine)) {
            remarks = nextLine.split(/[:\-–]/)[1]?.trim() || "";
            break;
          }
        }
      }

      results.push({
        searchTerm: term,
        page: pageNum,
        matchedLine: line.trim(),
        serial: idx + 1,
        pageHeader: pageHeadings[pageNum] || ["No Heading"],
        remarks: remarks || "—"
      });
  }
});






    }

    // Give UI time to update
    await new Promise(r => setTimeout(r, 10));
  }

  renderReport(results);
  statusMessage.textContent = `✅ Search completed. ${results.length} matches found.`;
  statusMessage.style.color = "green";
  searchBtn.disabled = false;
});

async function extractPageTopLines(pdf, numberOfLines = 3) {
  const headings = {};

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    const items = textContent.items;

    // Group items by their vertical position (y)
    const linesMap = new Map();

    items.forEach(item => {
      const y = Math.floor(item.transform[5]);
      const x = item.transform[4];
      const str = item.str.trim();
      if (!str) return;

      if (!linesMap.has(y)) linesMap.set(y, []);
      linesMap.get(y).push({ str, x });
    });

    // Sort lines by Y descending (top of page first)
    const sortedLines = Array.from(linesMap.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([y, parts]) => {
        // Sort parts by x ascending
        parts.sort((a, b) => a.x - b.x);

        // Determine columns by splitting horizontal positions into 3 groups

        // Get min and max x for this line
        const xs = parts.map(p => p.x);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);

        // Compute boundaries to split into 3 columns
        const colWidth = (maxX - minX) / 3;

        // Arrays for left, middle, right column text
        const leftCol = [];
        const middleCol = [];
        const rightCol = [];

        parts.forEach(p => {
          const relativeX = p.x - minX;
          if (relativeX < colWidth) {
            leftCol.push(p.str);
          } else if (relativeX < colWidth * 2) {
            middleCol.push(p.str);
          } else {
            rightCol.push(p.str);
          }
        });

        // Join left and right columns only, skipping middle (page number col)
        const lineStr = [...leftCol, ...rightCol].join(" ").trim();

        return lineStr;
      });

    // Filter out empty or short lines
    const cleaned = sortedLines.filter(line => line.length > 3);

    headings[pageNum] = cleaned.slice(0, numberOfLines);
  }

  return headings;
}

function renderReport(results) {
  reportTable.innerHTML = "";

  if (results.length === 0) {
    reportTable.innerHTML = "<tr><td>No matches found.</td></tr>";
    return;
  }

  // Header row
  const headerRow = document.createElement("tr");
  ["Details", "Matched Record"].forEach(text => {
    const th = document.createElement("th");
    th.textContent = text;
    headerRow.appendChild(th);
  });
  reportTable.appendChild(headerRow);

  // Data rows
  results.forEach(result => {
    const row = document.createElement("tr");

    const headingCell = document.createElement("td");
    headingCell.innerHTML = result.pageHeader.join("<br>");

    const recordCell = document.createElement("td");
    recordCell.textContent = result.matchedLine;

    row.append(headingCell, recordCell);
    reportTable.appendChild(row);
  });
}
