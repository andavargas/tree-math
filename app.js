document.addEventListener('DOMContentLoaded', (event) => {
    const inputEquation = document.getElementById('input-equation');
    const visualizationContainer = document.getElementById('visualization-container');

    inputEquation.addEventListener('input', function() {
        const equation = inputEquation.value;

        const isValid = checkIfValid(equation);
        console.log("isValid:", isValid);
        if (isValid == 'valid') {
            // Create an instance of Equation with a sample equation
            let sampleEquation = new Equation(equation, true);
            console.log("right side: ", sampleEquation.r);
            updateVisualization(sampleEquation);
        }
    });

    function checkIfValid(text) {
        let returnString = "valid";
    
        // Check if number and distribution of equals and parentheses is good
        let nEqualsSign = 0;
        let nOpenParen = 0;
        let nCloseParen = 0;
        for (let char of text) {
            if (char === "=") {
                nEqualsSign++;
                if (nOpenParen !== nCloseParen) {
                    returnString = "Please use balanced parentheses ().";
                    break;
                }
            }
            if (char === "(") { nOpenParen++; }
            if (char === ")") { nCloseParen++; }
            if (char === "|") { // | is reserved for later
                returnString = "| is not allowed";
            }
    
            if (nOpenParen < nCloseParen) {
                returnString = "Please use balanced parentheses ().";
                break;
            }
        }
    
        if (nEqualsSign !== 1) { returnString = "Please use one and only one equals =."; }
        if (nOpenParen !== nCloseParen) { returnString = "Please use balanced parentheses ()."; }
        if (text.startsWith("=")) { returnString = "Equations do not start with an equals =."; }
        if (text.endsWith("=")) { returnString = "Equations do not end with an equals =."; }
        if (text.startsWith("+")) { returnString = "Equations do not start with a plus +."; }
        if (text.endsWith("+")) { returnString = "Equations do not end with a plus +."; }
        if (text.endsWith("-")) { returnString = "Equations do not end with a minus -."; }
        if (text.startsWith("*")) { returnString = "Equations do not start with a times *."; }
        if (text.endsWith("*")) { returnString = "Equations do not end with a times *."; }
        if (text.endsWith("/")) { returnString = "Equations do not end with a slash /."; }
    
        // Check if there are disallowed pairs of characters
        const disallowedPairs = ["(+", "(*", "+)", "-)", "*)", "/)", "()", "++", "+*", "-+", "--", "-*", "*+", "**", "*/", "/+", "/*", "//", "+=", "-=", "*=", "/=", "(=", "=+", "=)"];
        // "+-", "+/", "-/", "*-", "/-", "=-", "=/" // these are allowed
        for (const pair of disallowedPairs) {
            if (text.includes(pair)) {
                returnString = `${pair} is not allowed.`;
                break;
            }
        }
    
        let nMathChars = 0;
        const mathChars = ["=", "+", "*", "-", "/", "(", ")", "{", "}", "[", "]"];
        for (let char of text) {
            if (mathChars.includes(char)) {
                nMathChars++;
            }
        }
    
        if (nMathChars > 15 || text.length > 100) {
            returnString = "Please use a shorter equation.";
        }
    
        return returnString;
    }
    
    function updateVisualization(equation) {
        // Clear the previous visualization
        visualizationContainer.innerHTML = '';
    
        // Create divs for the left constituent and equals sign
        const leftDiv = document.createElement('div');
        leftDiv.id = 'left-constituent';
        leftDiv.textContent = equation.l.toString();
        console.log("left side: " + equation.l);

        const equalsDiv = document.createElement('div');
        equalsDiv.id = 'equals';
        equalsDiv.textContent = '=';

        const rightDiv = document.createElement('div');
        rightDiv.id = 'right-constituent';
        rightDiv.textContent = equation.r.toString();

        // Append the created divs to the visualization container
        visualizationContainer.appendChild(leftDiv);
        visualizationContainer.appendChild(equalsDiv);
        visualizationContainer.appendChild(rightDiv);
    }
});
