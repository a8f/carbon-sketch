// ==UserScript==
// @name     Carbon Sketch
// @version  0.0.1
// @include  /https?:\/\/www\.sketch\.com\/s\/.*/
// @updateURL TODO
// @downloadURL TODO
// @namespace Alexander French
// @run-at document-start
// ==/UserScript==

const STRINGS = {
    typeface: "Typeface",
    text: "TEXT:",
    weight: "Weight",
    size: "Size",
    character: "Character",
    lineHeight: "Line Height",
    color: "Color",
};

const NAMES = {};
Object.entries(STRINGS).forEach(([k, v]) => (NAMES[v] = k));
NAMES["Text"] = "text";

let watchingInspectorPanel = false;

run();

function run() {
    const panelCreationObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === "childList") {
                const nodes = mutation.target.querySelectorAll("a[class='active']");
                if (nodes && nodes.length) {
                    panelCreated(nodes);
                    panelCreationObserver.disconnect();
                }
            }
        });
    });
    panelCreationObserver.observe(document.documentElement, { childList: true, subtree: true });
}

function panelCreated(tabNodes) {
    if (watchingInspectorPanel) {
        return;
    }
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === "childList") {
                const newNodes = Array.from(mutation.addedNodes);
                if (newNodes && newNodes.length) {
                    newNodes.forEach(handlePanelNode);
                }
            }
            else if (mutation.type === "characterData" &&
                mutation.target &&
                mutation.target.textContent &&
                mutation.target.parentElement.parentElement.parentElement.parentElement
            ) {
                if (NAMES[mutation.target.textContent.split(":")[0]] ||
                    mutation.target.textContent.match(/#[a-f\d]+/i)
                ) {
                    handlePanelNode(mutation.target.parentElement.parentElement.parentElement.parentElement);
                }
            }
        });
    });
    const inspectorTab = Array.from(tabNodes).find((node) => node.href.endsWith("#Inspector"));

    const container = inspectorTab
        && inspectorTab.parentElement
        && inspectorTab.parentElement.parentElement
        && inspectorTab.parentElement.parentElement.parentElement;
    if (!container) {
        console.warn("Didn't find inspector right panel container", inspectorTab, container);
        return;
    }
    watchingInspectorPanel = true;
    observer.observe(container, { childList: true, subtree: true, characterData: true });
}

function handlePanelNode(node) {
    const data = getNodeData(node);
    if (typeof data !== "object") return;
    if (data.type === "fonts") {
        const container = node.childNodes[node.childNodes.length - 1].childNodes[1];
        let newNode = document.querySelector("div[id='carbon-text-info']");
        let exists = true;
        if (!newNode) {
            newNode = container.firstElementChild.cloneNode(true);
            exists = false;
        }
        newNode.style.maxWidth = window.getComputedStyle(newNode).width;
        newNode.id = "carbon-text-info";
        newNode.childNodes[0].innerText = "Carbon";
        newNode.childNodes[1].innerText = data.fonts.join(",\n");
        newNode.childNodes[1].title = "Carbon";
        newNode.childNodes[1].classList = [];
        if (newNode.childNodes[2]) {
            newNode.childNodes[2].remove(); // TODO support copying to clipboard
        }
        if (!exists) {
            container.insertBefore(newNode, container.firstElementChild);
        }
    }
}

function getNodeData(node) {
    if (!node) return node;
    // Text content
    if (node.lastElementChild && node.lastElementChild.childNodes.length > 1) {
        const innerText = node.lastElementChild.firstElementChild.innerText;
        if (innerText && innerText.startsWith(STRINGS.text)) {
            const infoDivs = node.lastElementChild.childNodes[1].childNodes;
            let possibleFonts = null;
            let prefPrefix = null;
            const deleteIndices = {};
            infoDivs.forEach((div) => {
                if (div.childNodes.length < 2) return;
                const attr = div.firstElementChild && NAMES[div.firstElementChild.innerText];
                if (!attr) return;
                const text = div.childNodes[1].innerText;
                if (attr === "typeface") {
                    switch (text) {
                    case "IBM Plex Sans":
                        prefPrefix = "productive";
                        break;
                    case "IBM Plex Mono":
                        prefPrefix = "code";
                        break;
                    }
                } else if (attr === "color") {
                    const lower = text.toLowerCase();
                    if (styles[lower]) {
                        const textColor = styles[lower].find((style) => style.startsWith("text"));
                        const newNode = div.childNodes[1].cloneNode(true);
                        newNode.innerHTML = (textColor || styles[lower].join("<br>")) + "&nbsp;";
                        newNode.id = "carbon-color";
                        newNode.classList.add("carbon-text-color");
                        div.insertBefore(newNode, div.childNodes[1]);
                    }
                } else {
                    let data;
                    switch (attr) {
                    case "weight":
                        data = text.split(" (")[1].replace(")", "");
                        break;
                    case "size":
                    case "character":
                        data = text + "px";
                        break;
                    case "lineHeight":
                        data = text.split(" (")[0] + "px";
                        break;
                    default:
                        return;
                    }
                    if (styles[attr][data]) {
                        if (!possibleFonts) {
                            possibleFonts = styles[attr][data];
                        } else {
                            possibleFonts = possibleFonts.filter((font) => styles[attr][data].indexOf(font) !== -1);
                        }
                    }
                }
            });
            if (possibleFonts && possibleFonts.length) {
                if (possibleFonts.length > 1 && prefPrefix) {
                    const sorted = possibleFonts.sort((a, b) => a.length > b.length);
                    const base = sorted[0];
                    let foundPref = false;
                    sorted.slice(1).forEach((font) => {
                        if (font.endsWith(base)) {
                            if (font.startsWith(prefPrefix)) {
                                foundPref = true;
                                deleteIndices[possibleFonts.indexOf(base)] = true;
                            } else if (foundPref) {
                                deleteIndices[possibleFonts.indexOf(base)] = true;
                            }
                        }
                    });
                }
                return {type: "fonts", fonts: possibleFonts.filter((font, i) => (!deleteIndices[i] && Boolean(font)))};
            }
        }
    }
    // Colors - just replace inline (doesn't return value)
    if (node.getElementsByTagName && !node.querySelector("div[id='carbon-text-info']")) {
        let found;
        const divs = Array.from(node.getElementsByTagName("div"));
        divs.forEach((div) => {
            if (div.innerText && div.innerText.match(/#[a-f\d]+/i)) {
                const lower = div.innerText.toLowerCase();
                if (styles[lower]) {
                    let exists = true;
                    const newNode = div.parentElement.parentElement.querySelector("div[id='carbon-color']") ||
                        (exists = false) || div.cloneNode(true);
                    if (exists && newNode.classList.contains("carbon-text-color")) {
                        const textColor = styles[lower].find((style) => style.startsWith("text"));
                        newNode.innerHTML = (textColor || styles[lower].join("<br>")) + "&nbsp;";
                    } else {
                        newNode.innerHTML = styles[lower].join("<br>");
                    }
                    newNode.id = "carbon-color";
                    if (!exists) {
                        div.parentElement.insertBefore(newNode, div);
                    }
                    found = true;
                }
            }
        });
        if (found) return;
    }
    // TODO spacing
}
