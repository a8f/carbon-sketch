const fs = require("fs");
const readline = require("readline");

const CSS_TO_STRINGS = {
    "font-size": "size",
    "line-height": "lineHeight",
    "font-weight": "weight",
    "font-size": "size",
    "letter-spacing": "character",
}

const REM_TO_PX = 16; // Set to false to disable conversion
const CARBON_PATH = "carbon-styles.txt";
const OUT_PATH = "styles.js";

(async () => {
    // Parse lines from file
    const file = fs.createReadStream(CARBON_PATH)
    const lines = readline.createInterface({ input: file, ctrlfDelay: Infinity });
    const styles = {colors: {}, fonts: {}, spacing: {}};
    for await (const line of lines) {
        // line format: --cds-interactive-01: #333333;
        const [name, value] = line.slice(6, line.length - 1).split(": ");
        if (name && value) {
            parseStyle(styles, name, value);
        }
    }

    // Optimize object structure for searching by value
    for (const [name, value] of Object.entries(styles.colors)) {
        styles[value] = name;
    }
    delete styles.colors;
    for (const [name, info] of Object.entries(styles.fonts)) {
        for (const [attr, val] of Object.entries(info)) {
            // TODO support typeface and remove from next line
            if (!styles[attr] && attr !== "typeface") {
                styles[attr] = {};
            }
            const push = (v) => {
                if (!styles[attr][v]) {
                    styles[attr][v] = [];
                }
                styles[attr][v].push(name);
            }
            if (attr === "typeface") {
                // TODO
                //val.forEach(push);
            } else {
                push(val);
            }
        }
    }
    delete styles.fonts;

    // Write parsed data
    const parsed = "const styles = " + JSON.stringify(styles);
    fs.writeFile(
        OUT_PATH,
        parsed,
        (err) => (err ? console.log(err) : console.log("Done"))
    );
})();

function parseStyle(styles, name, value) {
    if (REM_TO_PX && value.endsWith("rem")) {
        value = `${parseFloat(value.slice(0, value.length - 3)) * REM_TO_PX}px`;
    }
    // colours
    if (value.match(/\#[a-fA-F0-9]+/) || value.match(/rgba\(\d+, \d+, \d+\.?\d*\)/)) {
        styles.colors[name] = value;
    }
    // size/spacing
    else if (value.match(/\d+\.?\d*(px|rem|%)?/)) {
        const split = name.split("-");
        const end = (`${split[split.length - 2]}-${split[split.length - 1]}`);
        if (CSS_TO_STRINGS[end]) {
            const start = split.slice(0, split.length - 2).join("-");
            if (!styles.fonts[start]) {
                styles.fonts[start] = {};
            }
            styles.fonts[start][CSS_TO_STRINGS[end]] = value;
        } else {
            styles.spacing[name] = value;
        }
    }
    // Font names
    else if (value.match(/('.+',?)+/)) {
        const split = name.split("-");
        const styleName = split.slice(0, split.length - 2).join("-");
        if (!styles.fonts[styleName]) {
            styles.fonts[styleName] = {};
        }
        styles.fonts[styleName].typeface = value.toString().replace(/[\s\']/g, "").split(",");
    }
}
