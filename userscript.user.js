// ==UserScript==
// @name     Carbon Sketch
// @version  0.0.1
// @include  /https?:\/\/www\.sketch\.com\/s\/.*#Inspector/
// @run-at document-start
// ==/UserScript==

const STRINGS = {
    //typeface: "Typeface", // TODO make this work
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
                NAMES[mutation.target.textContent.split(":")[0]]) {
                handlePanelNode(mutation.target.parentElement.parentElement.parentElement.parentElement);
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
        const newNode = container.firstElementChild.cloneNode(true);
        newNode.style.maxWidth = window.getComputedStyle(newNode).width
        newNode.childNodes[0].innerText = "Carbon";
        newNode.childNodes[1].innerText = data.fonts.join(",\n");
        newNode.childNodes[1].title = "Carbon";
        newNode.childNodes[1].classList = [];
        newNode.childNodes[2].remove(); // TODO support copying to clipboard
        container.insertBefore(newNode, container.firstElementChild);
    }
}

function getNodeData(node) {
    if (!node) return node;
    if (node.lastElementChild && node.lastElementChild.childNodes.length > 1) {
        const innerText = node.lastElementChild.firstElementChild.innerText;
        if (innerText && innerText.startsWith(STRINGS.text)) {
            const infoDivs = node.lastElementChild.childNodes[1].childNodes;
            let possibleFonts = null;
            infoDivs.forEach((div) => {
                if (div.childNodes.length < 2) return;
                const attr = div.firstElementChild && NAMES[div.firstElementChild.innerText];
                if (!attr) return;
                const text = div.childNodes[1].innerText;
                let data;
                switch (attr) {
                case "typeface":
                    data = text;
                    break;
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
                        possibleFonts = possibleFonts.filter((font) => styles[attr][data].indexOf(font) !== -1)
                    }
                }
            });
            if (possibleFonts && possibleFonts.length) {
                return {type: "fonts", fonts: possibleFonts};
            }
        }
    }
}
