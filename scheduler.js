// Simple Scheduling App
// This could eventually connect to our calendar and cloud database.

let events = [
    {
        id: 1,
        title: "Study for Biology",
        date: "2026-09-24",
        time: "6:00 PM",
        completed: false
    }
];

// Add a new event
function addEvent(title, date, time) {
    const newEvent = {
        id: events.length + 1,
        title: title,
        date: date,
        time: time,
        completed: false
    };

    events.push(newEvent);
    console.log(`Added: ${title}`);
}

// Show all events
function showEvents() {
    console.log("\nYour Schedule:");

    events.forEach((event) => {
        const status = event.completed ? "Complete" : "Not Complete";

        console.log(
            `${event.id}. ${event.title} - ${event.date} at ${event.time} - ${status}`
        );
    });
}

// Mark an event as complete
function completeEvent(id) {
    const event = events.find((event) => event.id === id);

    if (event) {
        event.completed = true;
        console.log(`Completed: ${event.title}`);
    } else {
        console.log("Event not found.");
    }
}

// Delete an event
function deleteEvent(id) {
    const event = events.find((event) => event.id === id);

    if (event) {
        events = events.filter((event) => event.id !== id);
        console.log(`Deleted: ${event.title}`);
    } else {
        console.log("Event not found.");
    }
}


// TESTING OUR FUNCTIONS

addEvent("Work on Team Project", "2026-09-25", "4:00 PM");
addEvent("Finish Homework", "2026-09-25", "7:00 PM");

showEvents();

completeEvent(1);

showEvents();

deleteEvent(2);

showEvents();