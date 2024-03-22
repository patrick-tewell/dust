
// ----- Setup variables -----

const createDust = document.getElementById("createDust");
const center = document.getElementById("center");
const dustPerClickButton = document.getElementById("dustPerClickButton");
const dustSizeButton = document.getElementById("dustSizeButton");
const gravityButton = document.getElementById("gravityButton");

let dustCounter = 0;
let dustPerClick = 1;
let dustSize = 8;
let gravity = 100;
let centerSize = 1;
let sizeIncrease = 1;
let intervals = [];

// ----- Random number generator -----

function random(limit) {
    return Math.floor(Math.random() * limit);
}

// ----- Button event listeners -----

dustPerClickButton.addEventListener("click", () => {
    dustPerClick += 1;
    document.getElementById("dustPerClickDisplay").innerHTML = `${dustPerClick}`;
});

dustSizeButton.addEventListener("click", () => {
    dustSize += 1;
    document.getElementById("dustSizeDisplay").innerHTML = `${dustSize}`;
});

gravityButton.addEventListener("click", () => {
    gravity += 1;
    document.getElementById("gravityDisplay").innerHTML = `${gravity}`;
});

// ----- Create dust main loop ------

createDust.addEventListener('click', () => {
    //
    let tempX = random(900) + 50;
    let tempY = random(900) + 50;
    let tempT = (15 + (Math.random() * 5)) - (gravity * 0.1);
    console.log(`tempT: ${tempT}`);

    // Create dust / click
    for (let i = dustPerClick; i > 0; i--) {

        // Bottom line for speed/gravity
        if (tempT <= 1) {
            tempT = 1;
        };

        dustCounter++;
        const c = `<div id="dust${dustCounter}" class="dust"></div>`;
        center.insertAdjacentHTML('afterend', c);
        

        currentDust = document.getElementById(`dust${dustCounter}`);

        console.log(`dustCounter: ${dustCounter}`);
        currentDust.style.width = `${dustSize}px`;
        currentDust.style.height = `${dustSize}px`;
        currentDust.style.left = `${tempX}px`;
        currentDust.style.top = `${tempY}px`;
    };

    if (dustCounter > 0) {
        animationInterval = setInterval(() => animateDust(currentDust, currentDust.style.left, currentDust.style.top), tempT);
        intervals.push(animationInterval);
        console.log(`interval push: ${intervals}`);
    } else {
        for (intervals in intervals) {
            clearInterval(intervals[intervals]);
        }
    };

});

// Create instance for animation




// Animation for new dust elements
let dust = {


    
    animateDust: (currentDust, originX, originY) => {
        // Remove elements in the center
        if (originX === "500px" && originY === "500px") {
            clearInterval(intervals[currentDust]);
            intervals.shift();
            dustCounter--;
            console.log(`interval shift: ${intervals}`);
            currentDust.remove();
            centerSize += sizeIncrease;
        };

        // X position animation
        let moveX = parseInt(originX) - 500;
        let newX = originX;

        if (moveX < 0) {
            newX = parseInt(originX) + 1;
            currentDust.style.left = `${newX}px`;
        } else if (moveX > 0) {
            newX = parseInt(originX) - 1;
            currentDust.style.left = `${newX}px`;
        };

        // Y position animation
        let moveY = parseInt(originY) - 500;
        let newY = originY;

        if (moveY < 0) {
            newY = parseInt(originY) + 1;
            currentDust.style.top = `${newY}px`;
        } else if (moveY > 0) {
            newY = parseInt(originY) - 1;
            currentDust.style.top = `${newY}px`;
        };
    },

}









/*let dust = {
    tempX : random(900) + 50,
    tempY : random(900) + 50,
    tempT : (15 + (Math.random() * 5)) - (gravity * 0.1),

    createTime: (gravity) => {
        (15 + (Math.random() * 5)) - (gravity * 0.1);
        
    },

    createDust: () => {

        const c = `<circle id="dust${dustCounter}" cx="${tempX}" cy="${tempY}" r="${dustSize}" fill="#735cdd"></circle>`;
        center.insertAdjacentHTML('afterend', c);
    }

};*/


/*createDust.addEventListener('click', () => {
    for (let i = dustPerClick; i > 0; i--) {
        let tempX = random(900) + 50;
        let tempY = random(900) + 50;
        let tempT = (15 + (Math.random() * 5)) - (gravity * 0.1);

        if (tempT <= 1) {
            tempT = 1;
        };

        dustCounter++;

        const c = `<circle id="dust${dustCounter}" cx="${tempX}" cy="${tempY}" r="${dustSize}" fill="#735cdd">
                   <animate attributeName="cx" from="${tempX}" to="500" dur="${tempT}s" repeatCount="indefinite"/>
                   <animate attributeName="cy" from="${tempY}" to="500" dur="${tempT}s" repeatCount="indefinite"/>
                   </circle>`;

        center.insertAdjacentHTML('afterend', c);

        let dustRemove = document.getElementById(`dust${dustCounter}`);

        dustRemove.addEventListener("animationend", () => {
            dustRemove.remove();
        });

    };
});*/







// Create observer instance

/*const observer = new MutationObserver((mutations, observer) => {
    // Check if the class state has changed
    const oldState = mutations[0].oldValue.split(/\s+/).includes('modal-open');
    const newState = document.body.classList.contains('modal-open');

    // If the class state changed, handle it
    if (oldState !== newState) {
        if (newState) {
            // Hide the dust element with class "hide-search"
            dust.remove();
        } else {
            // Show the dust element with class "hide-search"
            $('.hide-search').show();
        }
    }
});

// Observe changes to the class attribute of the body element
observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['class'],
    attributeOldValue: true,
});
*/

// Create new dust particle



// Combine dust into center


