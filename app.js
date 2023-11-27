document.addEventListener('DOMContentLoaded', (event) => {
    const inputEquation = document.getElementById('input-equation');
    const visualizationContainer = document.getElementById('visualization-container');

    inputEquation.addEventListener('input', function() {
        const equation = inputEquation.value;
        visualizationContainer.textContent = equation; // Update the visualization container with the equation
    });
});
