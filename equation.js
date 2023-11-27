class Equation {
    constructor(text, fromScratch) {
        this.text = text.replace(/\s/g, '').replace(/\{/g, '(').replace(/\[/g, '(')
                        .replace(/\}/g, ')').replace(/\]/g, ')');
        this.text = this.accountForInverses(this.text);
        this.eqArray = this.makeEqArray(this.text);
        this.eqArray = this.insertDroppedMults(this.eqArray);
        let whereEquals = this.eqArray.indexOf("=");
        this.lArray = this.eqArray.slice(0, whereEquals);
        this.rArray = this.eqArray.slice(whereEquals + 1);
        this.l = this.jsonify_(this.lArray);
        this.r = this.jsonify_(this.rArray);
    }

    jsonify_(expression) {
        expression = this.treeify_parentheses(expression);
        expression = this.treeify_multiplication(expression);
        //expression = this.extractInverses(expression);
        //expression = this.clearIdentities(expression);
        //expression = this.truncateSingleBranches(expression);
        return expression;
    }

    treeify_multiplication(expression) {
        // make ['a', '+', 'b', '*', 'c', '*', 'd', '+', 'e', '*', 'f'] -> ['a', '+', ['b', '*', 'c', '*', 'd'], '+', ['e', '*', 'f']]

        for (let i = 0; i < expression.length; i++) {
            if (Array.isArray(expression[i])) expression[i] = this.treeify_multiplication(expression[i]);
        }
        console.log(expression);

        if (expression.includes('*') && expression.includes('+')) {
            let groupedArray = [];
            let currentGroup = [];
            let isGrouping = false;
        
            for (let i = 0; i < expression.length; i++) {
                console.log(i);
                if (expression[i+1] === '*' && !isGrouping) {
                    // Start a new group
                    isGrouping = true;
                    currentGroup = expression.slice(i, i + 3);
                    i+=2; // Skip the next two elements as they're part of the group
                } else if (expression[i] === '*' && isGrouping) {
                    // Add to the current group
                    currentGroup.push(expression[i], expression[i + 1]);
                    i++; // Skip the next element as it's part of the group
                } else {
                    if (isGrouping) {
                        // End the current group and add to the main array
                        groupedArray.push(currentGroup);
                        isGrouping = false;
                    }
                    groupedArray.push(expression[i]);
                }
            }
        
            // Add the last group if the array ended with a group
            if (isGrouping) {
                groupedArray.push(currentGroup);
            }
        
            return groupedArray;
        } else {
            return expression;
        }
    }

    extractInverses(expression) {
        if (expression.includes['*']) {

        } else if (expression.includes['+']) {

        } else { // it's a leaf

        }
    }

    treeify_parentheses(expression) {
        // make ['a', '+', '-(', 'b', '+', 'c', ')'] -> ['a', '+', ['-(', 'b', '+', 'c']]
        // NOTE assumes the last closed parenthesis closes the first open one. BROKEN! TODO

        const firstIndexOfOpenParen = expression.findIndex(element => element.includes("("));
        var lastIndexOfClosedParen = expression.length - expression.slice().reverse().indexOf(")");
        if (lastIndexOfClosedParen > expression.length) lastIndexOfClosedParen = -1;

        if (expression != 'a') {
            console.log(firstIndexOfOpenParen);
            console.log(lastIndexOfClosedParen);
            console.log("filler");
        }

        if (firstIndexOfOpenParen == -1 || lastIndexOfClosedParen == -1) {
            return expression
        } else {
            return expression.slice(0, firstIndexOfOpenParen)
                .concat([[expression[firstIndexOfOpenParen]].concat(
                    this.treeify_parentheses(expression.slice(firstIndexOfOpenParen+1, lastIndexOfClosedParen-1)))]
                )
                .concat(expression.slice(lastIndexOfClosedParen+1))
        }
    }

    string2charArray(text) {
        return Array.from(text);
    }

    charArray2string(textArray) {
        return textArray.join('');
    }

    accountForInverses(text) {
        let textArray = this.string2charArray(text);
        let returnTextArray = [textArray[0]];
        for (let i = 1; i < textArray.length; i++) {
            if (textArray[i] === '-' && !['*', '/', '(', '='].includes(textArray[i - 1])) {
                returnTextArray.push('+');
            } else if (textArray[i] === '/' && !['+', '-', '(', '='].includes(textArray[i - 1])) {
                returnTextArray.push('*');
            }
            returnTextArray.push(textArray[i]);
        }
        return this.charArray2string(returnTextArray);
    }

    insertDroppedMults(textArray) {
        let returnTextArray = [...textArray];
        for (let i = 1; i < returnTextArray.length; i++) {
            if (returnTextArray[i] === '(' && !['+', '-', '*', '/', '(', '=', '-(', '/(', '-/(', '/-('].includes(returnTextArray[i - 1])) {
                returnTextArray.splice(i, 0, '*');
            }
            if (returnTextArray[i] === ')' && i < returnTextArray.length - 1 && !['+', '-', '*', '/', ')', '='].includes(returnTextArray[i + 1])) {
                returnTextArray.splice(i + 1, 0, '*');
            }
        }
        return returnTextArray;
    }

    makeEqArray(text) {
        let text1 = "";
        for (let char of text) {
            if (['+', '*', '(', ')', '='].includes(char)) {
                text1 += ` ${char} `;
            } else {
                text1 += char;
            }
        }
        text1 = text1.trim().replace(/  /g, ' ').replace(/- \(/g, '-(').replace(/\/ \(/g, '/(');
        return text1.split(' ');
    }
}
