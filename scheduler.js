// ----------------------------
// SCHEDULING APP
// ----------------------------


// Starting events

let events = [
    {
        id: 1,
        title: "Morning Study",
        date: "2026-09-30",
        startTime: "07:00",
        endTime: "08:00",
        type: "study",
        completed: false
    },

    {
        id: 2,
        title: "Biology Class",
        date: "2026-09-30",
        startTime: "09:00",
        endTime: "09:50",
        type: "school",
        completed: false
    },

    {
        id: 3,
        title: "Work on Team Project",
        date: "2026-09-30",
        startTime: "11:00",
        endTime: "12:00",
        type: "work",
        completed: false
    }
];


// ----------------------------
// VARIABLES
// ----------------------------

let selectedDate = new Date();

let currentView = "week";


// ----------------------------
// HTML ELEMENTS
// ----------------------------

const weekView = document.querySelector("#week-view");

const dayView = document.querySelector("#day-view");

const weekDays = document.querySelector("#week-days");

const daySchedule = document.querySelector("#day-schedule");

const currentDateTitle =
    document.querySelector("#current-date-title");

const pageTitle =
    document.querySelector("#page-title");


const weekViewButton =
    document.querySelector("#week-view-button");

const dayViewButton =
    document.querySelector("#day-view-button");


const previousButton =
    document.querySelector("#previous-button");

const nextButton =
    document.querySelector("#next-button");


const addEventButton =
    document.querySelector("#add-event-button");

const modal =
    document.querySelector("#event-modal");

const closeModalButton =
    document.querySelector("#close-modal");

const eventForm =
    document.querySelector("#event-form");


// ----------------------------
// DATE FUNCTIONS
// ----------------------------

function formatDate(date) {

    const year = date.getFullYear();

    const month =
        String(date.getMonth() + 1).padStart(2, "0");

    const day =
        String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}


function formatTime(time) {

    const [hour, minute] = time.split(":");

    const date = new Date();

    date.setHours(hour);

    date.setMinutes(minute);


    return date.toLocaleTimeString(
        "en-US",
        {
            hour: "numeric",
            minute: "2-digit"
        }
    );
}


// ----------------------------
// GET START OF WEEK
// ----------------------------

function getStartOfWeek(date) {

    const start = new Date(date);

    const day = start.getDay();

    start.setDate(start.getDate() - day);

    return start;
}


// ----------------------------
// EVENT ICONS
// ----------------------------

function getEventIcon(type) {

    if (type === "school") {
        return "🎓";
    }

    if (type === "study") {
        return "📚";
    }

    if (type === "work") {
        return "💻";
    }

    if (type === "exercise") {
        return "🏃";
    }

    return "⭐";
}


// ----------------------------
// DISPLAY WEEK
// ----------------------------

function displayWeek() {

    weekDays.innerHTML = "";

    const startOfWeek =
        getStartOfWeek(selectedDate);


    const endOfWeek =
        new Date(startOfWeek);

    endOfWeek.setDate(
        endOfWeek.getDate() + 6
    );


    currentDateTitle.textContent =
        `${startOfWeek.toLocaleDateString(
            "en-US",
            {
                month: "long",
                day: "numeric"
            }
        )} - ${endOfWeek.toLocaleDateString(
            "en-US",
            {
                month: "long",
                day: "numeric",
                year: "numeric"
            }
        )}`;


    const today = new Date();


    for (let i = 0; i < 7; i++) {

        const date =
            new Date(startOfWeek);

        date.setDate(
            startOfWeek.getDate() + i
        );


        const dateString =
            formatDate(date);


        const dayColumn =
            document.createElement("div");

        dayColumn.classList.add(
            "week-day"
        );


        if (
            formatDate(date) ===
            formatDate(today)
        ) {
            dayColumn.classList.add(
                "today"
            );
        }


        // Header

        const header =
            document.createElement("div");

        header.classList.add(
            "week-day-header"
        );


        header.innerHTML = `
            <div class="week-day-name">
                ${date.toLocaleDateString(
                    "en-US",
                    {
                        weekday: "short"
                    }
                )}
            </div>

            <div class="week-day-number">
                ${date.getDate()}
            </div>
        `;


        dayColumn.appendChild(header);


        // Get events for this day

        const dayEvents =
            events
                .filter(
                    event =>
                        event.date ===
                        dateString
                )
                .sort(
                    (a, b) =>
                        a.startTime.localeCompare(
                            b.startTime
                        )
                );


        // Display events

        dayEvents.forEach(event => {

            const eventCard =
                document.createElement(
                    "div"
                );

            eventCard.classList.add(
                "week-event"
            );


            eventCard.innerHTML = `
                <span class="week-event-icon">
                    ${getEventIcon(
                        event.type
                    )}
                </span>

                <strong>
                    ${event.title}
                </strong>

                <div class="week-event-time">
                    ${formatTime(
                        event.startTime
                    )}
                </div>
            `;


            dayColumn.appendChild(
                eventCard
            );
        });


        // Click day to open day view

        dayColumn.addEventListener(
            "click",
            function () {

                selectedDate =
                    new Date(date);

                switchToDayView();
            }
        );


        weekDays.appendChild(
            dayColumn
        );
    }
}


// ----------------------------
// DISPLAY DAY
// ----------------------------

function displayDay() {

    daySchedule.innerHTML = "";


    const dateString =
        formatDate(selectedDate);


    currentDateTitle.textContent =
        selectedDate.toLocaleDateString(
            "en-US",
            {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric"
            }
        );


    const dayEvents =
        events
            .filter(
                event =>
                    event.date ===
                    dateString
            )
            .sort(
                (a, b) =>
                    a.startTime.localeCompare(
                        b.startTime
                    )
            );


    // No events

    if (dayEvents.length === 0) {

        daySchedule.innerHTML = `
            <div class="empty-day">

                <h3>
                    Nothing scheduled yet!
                </h3>

                <p>
                    Click the + button to
                    add something to this day.
                </p>

            </div>
        `;

        return;
    }


    // Display each event

    dayEvents.forEach(event => {

        const eventElement =
            document.createElement(
                "div"
            );


        eventElement.classList.add(
            "day-event"
        );


        if (event.completed) {

            eventElement.classList.add(
                "completed"
            );
        }


        eventElement.innerHTML = `

            <div class="day-event-time">

                ${formatTime(
                    event.startTime
                )}

            </div>


            <div class="day-event-icon">

                ${getEventIcon(
                    event.type
                )}

            </div>


            <div class="day-event-info">

                <p>

                    ${formatTime(
                        event.startTime
                    )}

                    -

                    ${formatTime(
                        event.endTime
                    )}

                </p>

                <h3>
                    ${event.title}
                </h3>

            </div>


            <button
                class="complete-button"
                data-id="${event.id}"
            >

                ${event.completed
                    ? "✓"
                    : "○"}

            </button>
        `;


        daySchedule.appendChild(
            eventElement
        );
    });


    // Complete buttons

    const completeButtons =
        document.querySelectorAll(
            ".complete-button"
        );


    completeButtons.forEach(button => {

        button.addEventListener(
            "click",
            function () {

                const id =
                    Number(
                        button.dataset.id
                    );

                toggleComplete(id);
            }
        );

    });
}


// ----------------------------
// COMPLETE EVENT
// ----------------------------

function toggleComplete(id) {

    const event =
        events.find(
            event =>
                event.id === id
        );


    if (event) {

        event.completed =
            !event.completed;

        displayDay();
    }
}


// ----------------------------
// SWITCH VIEWS
// ----------------------------

function switchToWeekView() {

    currentView = "week";


    weekView.classList.remove(
        "hidden"
    );

    dayView.classList.add(
        "hidden"
    );


    weekViewButton.classList.add(
        "active"
    );

    dayViewButton.classList.remove(
        "active"
    );


    pageTitle.textContent =
        "My Week";


    displayWeek();
}


function switchToDayView() {

    currentView = "day";


    dayView.classList.remove(
        "hidden"
    );

    weekView.classList.add(
        "hidden"
    );


    dayViewButton.classList.add(
        "active"
    );

    weekViewButton.classList.remove(
        "active"
    );


    pageTitle.textContent =
        "My Day";


    displayDay();
}


// ----------------------------
// VIEW BUTTONS
// ----------------------------

weekViewButton.addEventListener(
    "click",
    switchToWeekView
);


dayViewButton.addEventListener(
    "click",
    switchToDayView
);


// ----------------------------
// PREVIOUS
// ----------------------------

previousButton.addEventListener(
    "click",
    function () {

        if (currentView === "week") {

            selectedDate.setDate(
                selectedDate.getDate() - 7
            );

            displayWeek();

        } else {

            selectedDate.setDate(
                selectedDate.getDate() - 1
            );

            displayDay();
        }
    }
);


// ----------------------------
// NEXT
// ----------------------------

nextButton.addEventListener(
    "click",
    function () {

        if (currentView === "week") {

            selectedDate.setDate(
                selectedDate.getDate() + 7
            );

            displayWeek();

        } else {

            selectedDate.setDate(
                selectedDate.getDate() + 1
            );

            displayDay();
        }
    }
);


// ----------------------------
// OPEN ADD EVENT
// ----------------------------

addEventButton.addEventListener(
    "click",
    function () {

        document.querySelector(
            "#event-date"
        ).value =
            formatDate(selectedDate);


        modal.style.display =
            "flex";
    }
);


// ----------------------------
// CLOSE MODAL
// ----------------------------

closeModalButton.addEventListener(
    "click",
    function () {

        modal.style.display =
            "none";
    }
);


modal.addEventListener(
    "click",
    function (event) {

        if (event.target === modal) {

            modal.style.display =
                "none";
        }
    }
);


// ----------------------------
// ADD NEW EVENT
// ----------------------------

eventForm.addEventListener(
    "submit",
    function (event) {

        event.preventDefault();


        const title =
            document.querySelector(
                "#event-title"
            ).value;


        const date =
            document.querySelector(
                "#event-date"
            ).value;


        const startTime =
            document.querySelector(
                "#event-time"
            ).value;


        const endTime =
            document.querySelector(
                "#event-end-time"
            ).value;


        const type =
            document.querySelector(
                "#event-type"
            ).value;


        const newEvent = {

            id: Date.now(),

            title: title,

            date: date,

            startTime: startTime,

            endTime: endTime,

            type: type,

            completed: false
        };


        events.push(newEvent);


        eventForm.reset();


        modal.style.display =
            "none";


        if (currentView === "week") {

            displayWeek();

        } else {

            displayDay();
        }
    }
);


// ----------------------------
// START APP
// ----------------------------

displayWeek();