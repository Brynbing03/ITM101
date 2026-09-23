// create a math function assignment 
// week 2
// Brynlee Bingham

const operation = process.argv[2];
const num1 = Number(process.argv[3]);
const num2 = Number(process.argv[4]);

function add(a, b) {
    return a + b;
}

function subtract(a, b) {
    return a - b;
}

function multiply(a, b) {
    return a * b;
}

function divide(a, b) {
    return a / b;
}

function exponent(a, b) {
    return a ** b;
}

let result;

if (operation === "add") {
    result = add(num1, num2);
} else if (operation === "subtract") {
    result = subtract(num1, num2);
} else if (operation === "multiply") {
    result = multiply(num1, num2);
} else if (operation === "divide") {
    result = divide(num1, num2);
} else if (operation === "exponent") {
    result = exponent(num1, num2);
} else {
    console.log("Invalid operation.");
    process.exit();
}

console.log(`${operation}: ${num1} and ${num2} = ${result}`);