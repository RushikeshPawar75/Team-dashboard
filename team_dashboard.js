frappe.pages['team-dashboard'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'Team Dashboard',
		single_column: true
	});

    // Render Task Overview
    renderTaskOverview(page);

    let spacer = $('<div></div>').css({
        height: '20px', 
    });
    page.main.append(spacer);

    // Render Timesheet Management
    renderTimesheetManagement(page);

    let spacer2 = $('<div></div>').css({
        height: '20px', 
    });
    page.main.append(spacer2);

    // Render Weekly And Monthly Allocation
    renderWeeklyAndMonthlyAllocation(page);

    let spacer3 = $('<div></div>').css({
        height: '20px', 
    });
    page.main.append(spacer3);

    // Render Productivity Matrix
    renderProductivityMatrix(page);

    let spacer5 = $('<div></div>').css({
        height: '20px', 
    });
    page.main.append(spacer5);

    // Render Project Health
    renderProjectHealth(page);

    let spacer6 = $('<div></div>').css({
        height: '20px', 
    });
    page.main.append(spacer6);

};

function renderTaskOverview(page) {
    let card_row = $("<div class='row' style='margin-bottom: 20px;'></div>").appendTo(page.body);

    function create_dual_number_card(title, count1, count2, color, callback1, callback2) {
        let card = $(`<div class="col-md-4">
            <div class="card task-card" style="background-color: ${color}; padding: 4px; border-radius: 8px; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s;">
                <div class="card-body text-center">
                    <h5 class="task-title">${title}</h5>
                    <div class="row">
                        <div class="col-6 task-section" style="border-left: 1px solid black; border-right: 1px solid black;">
                            <h4 class="task-count">${count1}</h4>
                            <p class="task-label">My Tasks</p>
                        </div>
                        <div class="col-6 task-section">
                            <h4 class="task-count">${count2}</h4>
                            <p class="task-label">Team Tasks</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>`);
    
        card.find('.col-6').eq(0).click(callback1);
        card.find('.col-6').eq(1).click(callback2);
    
        card.find('.task-card').hover(
            function () {
                $(this).css({
                    "transform": "scale(1.05)",
                    "box-shadow": "4px 4px 10px rgba(0, 0, 0, 0.2)"
                });
            },
            function () {
                $(this).css({
                    "transform": "scale(1)",
                    "box-shadow": "none"
                });
            }
        );

        function applyTheme() {
            let isDark = $('body').hasClass('dark-theme');
            let textColor = isDark ? 'white' : 'black';
            card.find('.task-title, .task-count, .task-label').css("color", textColor);
            card.find('.task-section').css("border-right", isDark ? "1px solid white" : "1px solid black");
        }
    
        applyTheme();
    
        $(document).on('theme-change', applyTheme);
    
        return card;
    }
    
    frappe.call({
        method: "nextproject.nextproject.page.team_dashboard.team_dashboard.get_task_counts",
        callback: function (r) {
            if (r.message) {
                let counts = r.message;
                let current_user = frappe.session.user;
                let is_administrator = current_user === "Administrator";

                frappe.call({
                    method: "frappe.client.get_value",
                    args: {
                        doctype: "Employee",
                        filters: { user_id: current_user },
                        fieldname: "name"
                    },
                    callback: function (res) {
                        let employee_id = res.message ? res.message.name : null;
                        if (!employee_id && !is_administrator) return;

                        frappe.call({
                            method: "frappe.client.get_list",
                            args: {
                                doctype: "Employee Group",
                                filters: { group_lead: employee_id },
                                fields: ["name"]
                            },
                            callback: function (group_res) {
                                let employee_groups = (group_res.message || []).map(d => d.name);
                                let is_team_lead = group_res.message.length > 0 || is_administrator;
                                let team_task_counts = is_team_lead ? counts.today_team_count : 0;

                                create_dual_number_card(
                                    '<strong>Today Tasks</strong>',
                                    employee_id ? counts.today_count : 0,
                                    team_task_counts,
                                    '#ffe47b',
                                    function() { frappe.set_route('List', 'Task', { 'exp_end_date': ['<=', frappe.datetime.get_today()], 'status': ['not in', ['Completed', 'Cancelled']], 'primary_consultant': ['=', employee_id] }); },
                                    function() { if (is_team_lead) frappe.set_route('List', 'Task', { 'exp_end_date': ['<=', frappe.datetime.get_today()], 'status': ['not in', ['Completed', 'Cancelled']], 'primary_consultant': ['!=', employee_id],'employee_group': ['in', employee_groups]}); }
                                ).appendTo(card_row);

                                create_dual_number_card(
                                    '<strong>Overdue Tasks</strong>',
                                    employee_id ? counts.overdue_count : 0,
                                    is_team_lead ? counts.overdue_team_count : 0,
                                    '#FE5551',
                                    function() { frappe.set_route('List', 'Task', { 'status': ['=', 'Overdue'], 'primary_consultant': ['=', employee_id] }); },
                                    function() { if (is_team_lead) frappe.set_route('List', 'Task', { 'status': ['=', 'Overdue'], 'primary_consultant': ['!=', employee_id], 'employee_group': ['in', employee_groups] }); }
                                ).appendTo(card_row);

                                create_dual_number_card(
                                    '<strong>Upcoming Tasks</strong>',
                                    employee_id ? counts.upcoming_count : 0,
                                    is_team_lead ? counts.upcoming_team_count : 0,
                                    '#57b68a',
                                    function() { frappe.set_route('List', 'Task', { 'exp_start_date': ['>=', frappe.datetime.get_today()], 'primary_consultant': ['=', employee_id] }); },
                                    function() { if (is_team_lead) frappe.set_route('List', 'Task', { 'exp_start_date': ['>=', frappe.datetime.get_today()], 'primary_consultant': ['!=', employee_id], 'employee_group': ['in', employee_groups]}); }
                                ).appendTo(card_row);
                            }
                        });
                    }
                });
            }
        }
    });

    let hr0 = $("<hr>").appendTo(page.body);

    if ($("body").hasClass("dark-mode")) {  
        hr0css("border-color", "#777");  
    } else {  
        hr0.css("border-color", "#eee");  
    }


    let action_row = $("<div class='row' style='margin-bottom: 20px;'></div>").appendTo(page.body);

    function create_action_button(label, color, onClick) {
    let button = $(
        `<div class="col-md-4">
            <div class="action-button text-center" style="background-color: ${color}; color: black; padding: 5px; border-radius: 8px; cursor: pointer; font-weight: bold; transition: transform 0.2s, box-shadow 0.2s;">
                ${label}
            </div>
        </div>`
    );

    button.find('.action-button').click(onClick);

    // Add hover effect
    button.find('.action-button').hover(
        function () {
            $(this).css({
                "transform": "scale(1.05)",
                "box-shadow": "4px 4px 10px rgba(0, 0, 0, 0.2)"
            });
        },
        function () {
            $(this).css({
                "transform": "scale(1)",
                "box-shadow": "none"
            });
        }
    );

    return button;
}

    create_action_button('<span style="color: black; font-weight: bold;">Timesheet Filling</span>', '#C0C0C0', () => {
        // Trigger the "Fetch Allocation" button immediately before navigating
        const tryClickFetchAllocationButton = () => {
            let fetchAllocationButton = document.querySelector('[data-label="Fetch%20Allocation"]'); // Find the "Fetch Allocation" button
            if (fetchAllocationButton) {
                fetchAllocationButton.click();  // Trigger the button click to fetch the allocation
            } else {
                // Retry every 200ms until the button is available
                setTimeout(tryClickFetchAllocationButton, 200);
            }
        };
        tryClickFetchAllocationButton();  // Trigger the "Fetch Allocation" button click
    
        // Redirect to the Timesheet Filling form
        frappe.set_route('Form', 'Timesheet Filling');
    }).appendTo(action_row);
    
    create_action_button('<span style="color: black; font-weight: bold;">Allocation Report</span>', '#C0C0C0', async () => {
        let current_user_email = frappe.session.user;
    
        // Fetch Employee ID based on logged-in user's email
        let employee_id = await frappe.db.get_value("Employee", {"user_id": current_user_email}, "name");
    
        if (employee_id && employee_id.message) {
            employee_id = employee_id.message.name;
        } else {
            frappe.msgprint(__('Employee record not found for the logged-in user.'));
            return;
        }
    
        // Navigate to Allocation Report
        frappe.set_route('query-report', 'Resource Allocation Summary', {
            'company': 'Dexciss Technology Pvt Ltd',
            'from_date': frappe.datetime.month_start(),
            'to_date': frappe.datetime.month_end(),
            'employee': employee_id
        });
    
        // Wait for the report to load, then trigger the "Generate New Report" button
        setTimeout(() => {
            let generateButton = document.querySelector('[data-label="Generate%20New%20Report"]'); // Finds button with label "Generate New Report"
            if (generateButton) {
                generateButton.click(); // Triggers the button click
            } else {
                console.warn("Generate New Report button not found");
            }
        }, 3000); // Wait 3 seconds to ensure the report has loaded
    }).appendTo(action_row);

    create_action_button(
        '<span style="color: black; font-weight: bold;">Task Status Change</span>',
        '#C0C0C0',
        () => {
            // Fetch data for the logged-in user and set values in the form
            frappe.call({
                method: "nextproject.nextproject.page.team_dashboard.team_dashboard.set_primary_consultant_and_group",
                args: {
                    user: frappe.session.user
                },
                callback: function (r) {
                    if (r.message) {
                        const { primary_consultant, employee_group } = r.message;
    
                        // Trigger the "Fetch Task" button immediately before navigating
                        const tryClickFetchTaskButton = () => {
                            let fetchTaskButton = document.querySelector('[data-label="Fetch%20Task"]'); // Find the "Fetch Task" button
                            if (fetchTaskButton) {
                                fetchTaskButton.click();  // Trigger the button click to fetch the task
                            } else {
                                // Retry every 200ms until the button is available
                                setTimeout(tryClickFetchTaskButton, 200);
                            }
                        };
                        tryClickFetchTaskButton();  // Trigger the "Fetch Task" button click
    
                        // Redirect to the Task Completion form with preset values
                        frappe.set_route('Form', 'Task Completion').then(() => {
                            frappe.model.with_doctype('Task Completion', () => {
                                const doc = frappe.model.get_doc('Task Completion');
                                doc.primary_consultant = primary_consultant;
                                doc.employee_group = employee_group;
                                frappe.set_route('Form', 'Task Completion');
                            });
                        });
                    } else {
                        frappe.msgprint("No matching Employee Group found for the logged-in user.");
                    }
                }
            });
        }
    ).appendTo(action_row);
    
    let hr1 = $("<hr>").appendTo(page.body);

    if ($("body").hasClass("dark-mode")) {  
        hr1.css("border-color", "#777");  
    } else {  
        hr1.css("border-color", "#eee");  
    }
    
    let charts_row = $("<div class='row'></div>").appendTo(page.body);

    create_chart_card('<span style="color: black; font-weight:bold;">Daily Task Hours</span>', charts_row, {
        chart_type: 'line',
        get_chart_data: 'nextproject.nextproject.page.team_dashboard.team_dashboard.daily_task_hours_chart'
    });

    create_chart_card('<span style="color: black; font-weight:bold;">Task Completion by Date</span>', charts_row, {
        chart_type: 'bar',
        get_chart_data: 'nextproject.nextproject.page.team_dashboard.team_dashboard.task_completion_chart'
    });
}
    

function renderTimesheetManagement(page) {
    const timesheet_section = $(page.body).append('<div class="timesheet-section"></div>');
    
    timesheet_section.append('<h3>Timesheet Management</h3>');

    let card_row = $("<div class='row' style='margin-bottom: 20px;'></div>").appendTo(timesheet_section);

    function create_dual_number_card(title, count1, count2, color, callback1, callback2) {
        let card = $(
            `<div class="col-md-6">
                <div class="card timesheet-card" style="background-color: ${color}; color: black; padding: 10px; border-radius: 8px; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s;">
                    <div class="card-body text-center">
                        <h5 class="task-title">${title}</h5>
                        <div class="row">
                            <div class="col-6 timesheet-section task-section" style="border-left: 1px solid black;style="border-right: 1px solid black;">
                                <h4 class="task-count" id="${title.replace(/\s/g, '-')}-count1">${count1}</h4>
                                <p class="task-label"><strong>My Timesheets</strong></p>
                            </div>
                            <div class="col-6 timesheet-section task-section">
                                <h4 class="task-count" id="${title.replace(/\s/g, '-')}-count2">${count2}</h4>
                                <p class="task-label"><strong>Team Timesheets</strong></p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`
        );
    
        card.find('.col-6').eq(0).click(callback1);
        card.find('.col-6').eq(1).click(callback2);
    
        // Add hover effect
        card.find('.timesheet-card').hover(
            function () {
                $(this).css({
                    "transform": "scale(1.05)",
                    "box-shadow": "4px 4px 10px rgba(0, 0, 0, 0.2)"
                });
            },
            function () {
                $(this).css({
                    "transform": "scale(1)",
                    "box-shadow": "none"
                });
            }
        );
    
        function applyTheme() {
            let isDark = $('body').hasClass('dark-theme');
            let textColor = isDark ? 'white' : 'black';
            card.find('.task-title, .task-count, .task-label').css("color", textColor);
            card.find('.task-section').css("border-right", isDark ? "1px solid white" : "1px solid black");
        }
    
        applyTheme();
    
        $(document).on('theme-change', applyTheme);
    
        return card;
    }
    
frappe.call({
    method: "nextproject.nextproject.page.team_dashboard.team_dashboard.get_timesheet_counts",
    callback: function (r) {
        if (r.message) {
            let counts = r.message;
            let employeeId = counts.employee_id;
            let teamMemberIds = counts.team_member_ids || [];
            let isTeamLead = teamMemberIds.length > 0;
            let employeeGroupLeadId = counts.employee_id;

            // Pending Timesheets Card
            create_dual_number_card(
                '<strong>Pending Timesheets</strong>',
                '<strong>' + counts.pending_timesheet_count + '</strong>',
                '<strong>' + counts.team_pending_timesheet_count + '</strong>',
                '#bde3e8',
                function () {
                    let filters = { status: "Open" };
                    if (employeeId) {
                        filters.employee = employeeId;
                    }
                    frappe.set_route('List', 'Timesheet Defaulter', filters);
                },
                function () {
                    if (isTeamLead) {
                        let filters = {
                            status: "Open",
                            employee: ["in", teamMemberIds],
                            report_to: employeeGroupLeadId
                        };
                        frappe.set_route('List', 'Timesheet Defaulter', filters);
                    } else {
                        frappe.msgprint("You are not a team lead.");
                    }
                }
            ).appendTo(card_row);

            // Timesheets Pending for Approval Card
            create_dual_number_card(
                '<strong>Timesheets Pending for Approval</strong>',
                '<strong>' + counts.pending_approval_count + '</strong>',
                '<strong>' + counts.team_pending_approval_count + '</strong>',
                '#f3baba',
                function () {
                    let filters = { status: "Draft" };
                    if (employeeId) {
                        filters.employee = employeeId;
                    }
                    frappe.set_route('List', 'Timesheet', filters);
                },
                function () {
                    if (isTeamLead) {
                        let filters = {
                            status: "Draft",
                            employee: ["in", teamMemberIds]
                        };
                        frappe.set_route('List', 'Timesheet', filters);
                    } else {
                        frappe.msgprint("You are not a team lead.");
                    }
                }
            ).appendTo(card_row);
        }
    }
});



    let hr0 = $('<hr>').appendTo(timesheet_section);
    if ($("body").hasClass("dark-mode")) {  
        hr0.css("border-color", "white");  
    } else {  
        hr0.css("border-color", "#eee"); // Light white  
    }


    // Create the action button row
const actionButtonRow = `
<div class="row" style="display: flex; justify-content: center; width: 100%;">
    <div class="col-md-6">
        <button class="btn btn-primary btn-block" id="timesheet-approval" style="background-color: #C0C0C0; color: black; font-weight: bold;">
            Timesheet Approval
        </button>
    </div>
</div>
`;
timesheet_section.append(actionButtonRow);

// Bind click event to the Timesheet Approval button
$("#timesheet-approval").click(function () {
// Check if the user has permission to view Timesheet Approval
frappe.call({
    method: "nextproject.nextproject.page.team_dashboard.team_dashboard.check_timesheet_approval_permission",
    callback: function (r) {
        if (r.message && r.message.has_permission) {
            // User has permission, redirect to Timesheet Approval List View
            frappe.set_route('List', 'Timesheet Approval');
        } else {
            // Display permission error message
            frappe.msgprint({
                title: __('Permission Denied'),
                message: __('You do not have permission to approve timesheets.'),
                indicator: 'red'
            });
        }
    }
});
});

let hr1 = $('<hr>').appendTo(timesheet_section);

if ($("body").hasClass("dark-mode")) {  
    hr1.css("border-color", "white");  
} else {  
    hr1.css("border-color", "#eee"); // Light white  
}

    // **Add the Allocation vs Timesheet Chart**
const charts_row = $('<div class="row" style="display: flex; justify-content: center; align-items: center; margin-top: 10px;"></div>');
timesheet_section.append(charts_row);

create_chart_card('<span style="color: black; font-weight:bold;">Allocation vs Timesheet</span>', charts_row, {
    chart_type: 'bar',
    get_chart_data: 'nextproject.nextproject.page.team_dashboard.team_dashboard.get_chart_data'
});


    // Function to fetch number card data (if any additional logic needed)
    function fetchNumberCardData() {
        // Placeholder function for future enhancements
    }

    // Function to bind events to number cards (if any additional events needed)
    function bindNumberCardEvents() {
        // Placeholder function for future enhancements
    }

    fetchNumberCardData();
    bindNumberCardEvents();
}


function renderWeeklyAndMonthlyAllocation(page) {
    // Create a section for Weekly and Monthly Allocation
    const allocationSection = $('<div class="allocation-section"></div>').appendTo(page.body);
    allocationSection.append('<h3>Weekly and Monthly Allocation</h3>');

    // Create a row for combined data number cards
    const numberCardRow = $(`
        <div class="row" style="margin-bottom: 20px;">
            <div class="col-md-4">
                <div class="card card-number-card" id="total-working-hours-card">
                    <div class="card-body text-center">
                        <h4 class="card-title">Total Working Hours</h4>
                        <p><strong>Individual:</strong> <span class="card-text" id="total-working-hours-count">Loading...</span></p>
                        <p><strong>Team:</strong> <span class="card-text" id="team-total-working-hours-count">Loading...</span></p>
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card card-number-card" id="task-allocation-hours-card">
                    <div class="card-body text-center">
                        <h4 class="card-title">Task Allocation Hours (This Week)</h4>
                        <p><strong>Individual:</strong> <span class="card-text" id="task-allocation-hours-count">Loading...</span></p>
                        <p><strong>Team:</strong> <span class="card-text" id="team-task-allocation-hours-count">Loading...</span></p>
                    </div>
                </div>
            </div>
            <div class="col-md-4">
                <div class="card card-number-card" id="this-week-allocation-card">
                    <div class="card-body text-center">
                        <h4 class="card-title">This Week Allocation</h4>
                        <p><strong>Individual:</strong> <span class="card-text" id="this-week-allocation-count">Loading...</span></p>
                        <p><strong>Team:</strong> <span class="card-text" id="team-this-week-allocation-count">Loading...</span></p>
                    </div>
                </div>
            </div>
        </div>
    `);

    allocationSection.append(numberCardRow);
    $('<hr>').appendTo(page.body);

    // Fetch data for the number cards
    fetchAllocationData();
    fetchAllocationData_1();

    // Apply theme styles automatically
    applyThemeStyles();
    
    // Listen for theme changes in Frappe's built-in system
    frappe.ui.theme_changed = function () {
        applyThemeStyles();
    };
}

// Function to apply theme styles dynamically
function applyThemeStyles() {
    let isDarkTheme = $('body').hasClass('dark-theme');

    $('.card-number-card').css({
        'background-color': isDarkTheme ? '#333' : '#fff',
        'color': isDarkTheme ? '#fff' : '#000',
        'border': isDarkTheme ? '1px solid #444' : '1px solid #ddd'
    });

    $('.card-title, .card-text').css('color', isDarkTheme ? '#fff' : '#000');
}

// Apply styles when the document is ready
$(document).ready(function () {
    applyThemeStyles();
});


function fetchAllocationData() {
    frappe.call({
        method: "nextproject.nextproject.page.team_dashboard.team_dashboard.get_number_card_data",
        callback: function(response) {
            const data = response.message;
            $("#total-working-hours-count").text(data.total_working_hours || 0);
            $("#task-allocation-hours-count").text(data.task_allocation_hours || 0);
            $("#this-week-allocation-count").text(data.this_week_allocation || 0);
        }
    });
}

function fetchAllocationData_1() {
    frappe.call({
        method: "nextproject.nextproject.page.team_dashboard.team_dashboard.get_number_card_data_1",
        callback: function(response) {
            const data = response.message;
            $("#team-total-working-hours-count").text(data.total_working_hours !== null ? data.total_working_hours : "N/A");
            $("#team-task-allocation-hours-count").text(data.task_allocation_hours !== null ? data.task_allocation_hours : "N/A");
            $("#team-this-week-allocation-count").text(data.this_week_allocation !== null ? data.this_week_allocation : "N/A");
        }
    });
}


function renderProductivityMatrix(page) {
    // Create a section for Productivity Matrix
    const ProductivityMatrixSection = $('<div class="productivity-matrix-section"></div>').appendTo(page.body);
    ProductivityMatrixSection.append('<h3>Productivity Matrix</h3>');

    // Row container for number cards
    const row = $('<div class="row"></div>').appendTo(ProductivityMatrixSection);

    // Weekly Task Completion card (as a number card)
    const weeklyTaskCompletionCard = $(`
        <div class="col-sm-4">
            <div class="card card-number-card" id="weekly-task-completion-card" style="cursor: pointer;">
                <div class="card-body text-center">
                    <h5 class="card-title">Weekly Task Completion</h5>
                    <button id="weekly-task-completion" class="btn btn-primary">View Tasks</button>
                </div>
            </div>
        </div>
    `).appendTo(row);

    // Handle the button click to route to the weekly task completion list
    $('#weekly-task-completion').click(() => {
        const start_of_week = moment().startOf('week').format('YYYY-MM-DD');
        const end_of_week = moment().endOf('week').format('YYYY-MM-DD');
        frappe.set_route('List', 'Task', {
            status: 'Completed',
            completed_on: ['between', [start_of_week,end_of_week]],
        });
    });

    // Efficiency card (table style)
    const efficiencyCard = $(`
        <div class="col-sm-4">
            <div class="card">
                <div class="card-body">
                    <h5 class="card-title">Weekly Efficiency</h5>
                    <p class="card-text" id="efficiency-percentage">Loading...</p>
                </div>
            </div>
        </div>
    `).appendTo(row);

    // Top Performer card (as a number card)
    const topPerformerCard = $(`
        <div class="col-sm-4">
            <div class="card card-number-card" id="top-performer-card" style="cursor: pointer;">
                <div class="card-body text-center">
                    <h5 class="card-title">Top Performers</h5>
                    <p class="card-text">Click to view top performers</p>
                </div>
            </div>
        </div>
    `).appendTo(row);

    let spacer4 = $('<br></br>').css({
        height: '20px',  // Adjust height as needed for more space
    });
    page.main.append(spacer4);

    // Initially, hide the top performers table
    const topPerformerTable = $(`
        <div class="col-12" id="top-performer-table-container" style="display: none; margin-top: 20px;">
            <div class="card">
                <div class="card-body">
                    <h5 class="card-title">Top Performers</h5>
                    <table class="table table-striped">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Points</th>
                            </tr>
                        </thead>
                        <tbody id="top-performer-table">
                            <tr><td colspan="2">Loading...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `).appendTo(ProductivityMatrixSection);

    // Handle the "Top Performers" card click to toggle table visibility
    $('#top-performer-card').click(() => {
        $('#top-performer-table-container').toggle();  // Toggle the visibility of the table
    });

    // Fetch data and populate cards
    frappe.call({
        method: 'nextproject.nextproject.page.team_dashboard.team_dashboard.get_productivity_data',
        callback: function(r) {
            if (r.message) {
                const data = r.message;

                // Efficiency
                $('#efficiency-percentage').text(data.efficiency.toFixed(2) + '%');

                // Top Performers: Make a table row with performers
                const tableBody = $('#top-performer-table');
                tableBody.empty();
                data.top_performers.forEach(performer => {
                    tableBody.append(`
                        <tr>
                            <td>${performer.name}</td>
                            <td>${performer.points}</td>
                        </tr>
                    `);
                });
            }
        }
    });

    $("<hr>").appendTo(page.body);
}


function renderProjectHealth(page) {
    // Create a section for ProjectHealth
    const ProjectHealthSection = $('<div class="project-health-section"></div>').appendTo(page.body);
    ProjectHealthSection.append('<h3>Project Health</h3>');

    // Row container for number cards
    const row = $('<div class="row mb-3"></div>').appendTo(ProjectHealthSection);

    // Overall Project Completion Card
    const overallProjectCompletionCard = $(`
        <div class="col-sm-4">
            <div class="card card-number-card" id="overall-project-completion-card" style="cursor: pointer;">
                <div class="card-body text-center">
                    <h5 class="card-title">Overall Project Completion</h5>
                    <p id="overall-project-completion" class="card-text">Loading...</p>
                </div>
            </div>
        </div>
    `).appendTo(row);
    
    // Open Risks Card
    const openRisksCard = $(`
        <div class="col-sm-4">
            <div class="card card-number-card" id="open-risks-card" style="cursor: pointer;">
                <div class="card-body text-center">
                    <h5 class="card-title">Open Risks</h5>
                    <button id="open-risks" class="btn btn-primary">View Risks</button>
                </div>
            </div>
        </div>
    `).appendTo(row);
    
    // Pending Milestones Card
    const pendingMilestonesCard = $(`
        <div class="col-sm-4">
            <div class="card card-number-card" id="pending-milestones-card" style="cursor: pointer;">
                <div class="card-body text-center">
                    <h5 class="card-title">Pending Milestones</h5>
                    <button id="pending-milestones" class="btn btn-primary">View Milestones</button>
                </div>
            </div>
        </div>
    `).appendTo(row);
    
    // Create a new row for the PMO Meetings Card
    const pmoRow = $('<div class="row justify-content-center mb-3"></div>').appendTo(ProjectHealthSection);
    
    // PMO Meetings Card
        
    const pmoMeetingsCard = $(`
        <div class="col-sm-6">
            <div class="card card-number-card" id="pmo-meetings-card" style="cursor: pointer;">
                <div class="card-body text-center">
                    <h5 class="card-title">PMO Meetings this Week</h5>
                    <p id="pmo-meetings-count" class="card-text">Loading...</p>
                </div>
            </div>
        </div>
    `).appendTo(pmoRow);

// Add click event to navigate to PMO Meetings
pmoMeetingsCard.on('click', function() {
    window.location.href = '/app/pmo-meetings';
});

    
    // Action Button Row
    const actionRow = $('<div class="row justify-content-center mb-5"></div>').appendTo(ProjectHealthSection);
    
    function create_action_button(label, color, onClick) {
        let button = $(
            `<div class="col-md-4">
                <div class="action-button text-center" style="background-color: ${color}; color: black; padding: 5px; border-radius: 8px; cursor: pointer; font-weight: bold; transition: transform 0.2s, box-shadow 0.2s;">
                    ${label}
                </div>
            </div>`
        );

        button.find('.action-button').click(onClick);

        // Add hover effect
        button.find('.action-button').hover(
            function () {
                $(this).css({
                    "transform": "scale(1.05)",
                    "box-shadow": "4px 4px 10px rgba(0, 0, 0, 0.2)"
                });
            },
            function () {
                $(this).css({
                    "transform": "scale(1)",
                    "box-shadow": "none"
                });
            }
        );

        return button;
    }

    // Action Button
    create_action_button('<span style="color: black; font-weight: bold;">This Week\'s Milestones</span>', '#C0C0C0', () => {
        var task_list = get_this_weeks_milestones();
        console.log("*****task_list***", task_list);

        if (Array.isArray(task_list) && task_list.length > 0) {
            frappe.route_options = { 'tasks': task_list };
            frappe.set_route('List', 'Task');
        } else {
            console.log("*****isid else***");
            frappe.msgprint(__('No milestones this week.'));
        }
    }).appendTo(actionRow);


    create_action_button('<span style="color: black; font-weight: bold;">Show Team Directory</span>', '#C0C0C0', () => {
        let modalId = 'teamDirectoryModal';
    
        // Remove existing modal if already present
        $('#' + modalId).remove();
    
        // Create modal HTML with increased size
        let $modal = $(`
            <div class="modal fade" id="${modalId}" tabindex="-1" role="dialog" aria-labelledby="teamDirectoryLabel" aria-hidden="true">
                <div class="modal-dialog" role="document" style="max-width: 90vw;"> 
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="teamDirectoryLabel">Team Directory</h5>
                            <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                                <span aria-hidden="true">&times;</span>
                            </button>
                        </div>
                        <div class="modal-body">
                            <div class="row mb-3">
                                <div class="col-md-4">
                                    <input type="text" class="form-control" id="search-team-directory" placeholder="Search by Name">
                                </div>
                                <div class="col-md-2">
                                    <button class="btn btn-primary" id="search-button">Search</button>
                                </div>
                            </div>
                            <div class="row mb-3">
                                <div class="col-md-6"><span id="employee-count"></span></div>
                                <div class="col-md-6 text-right">
                                    <select class="form-control d-inline-block w-auto" id="items-per-page">
                                        <option value="20">20 per page</option>
                                        <option value="50">50 per page</option>
                                        <option value="100">100 per page</option>
                                    </select>
                                </div>
                            </div>
                            <div id="team-directory-list" class="row"></div>
                            <div id="pagination" class="mt-3 text-center"></div>
                        </div>
                    </div>
                </div>
            </div>
        `);
    
        // Append modal to body and show it
        $('body').append($modal);
        $('#' + modalId).modal('show');
    
        // Fetch employee data
        fetchTeamDirectory();
    
        // Event Listeners
        $('#search-button').on('click', function () {
            let search_text = $('#search-team-directory').val().trim();
            if (!search_text) {
                alert("Please enter a name to search!");
                return;
            }
            fetchTeamDirectory();
        });
    
        $('#search-team-directory').on('input', function () {
            let search_text = $(this).val().trim();
            if (search_text === '') {
                fetchTeamDirectory();
            }
        });
    
        $('#items-per-page').on('change', function () {
            fetchTeamDirectory();
        });
    
        function fetchTeamDirectory(page = 1) {
            let search_text = $('#search-team-directory').val().trim();
            let items_per_page = parseInt($('#items-per-page').val());
    
            frappe.call({
                method: 'nextproject.nextproject.page.team_dashboard.team_dashboard.get_employees',
                args: { search_text, page, items_per_page },
                callback: function (r) {
                    if (r.message) {
                        let rankOrder = {
                            "CEO": 1, "Director": 2, "Vice President": 3, "General Manager": 4,
                            "Manager": 5, "Team Lead": 6,"Digital Marketing Executive":7, "VP Sales":8,
                            "Implementation consultant / Trainee Consultant": 9 ,"Sr Software Engineer / Senior Developer" : 10,
                            "Software Engineer": 11, "Software Developer": 12,
                            "Trainee Software Engineer": 13, "Intern": 14, "Housekeeping": 15
                        };
            
                        let sortedEmployees = r.message.employees.sort((a, b) => {
                            let designationA = (a.designation || "").trim().toLowerCase();
                            let designationB = (b.designation || "").trim().toLowerCase();
            
                            let rankA = rankOrder[designationA] || 100; // Default to 100 if not found
                            let rankB = rankOrder[designationB] || 100;
            
                            return rankA - rankB; // Ensures correct ranking
                        });
            
                        renderEmployeeCards(sortedEmployees);
                        $('#employee-count').text(`Employee Count: ${r.message.total_count}`);
                        renderPagination(r.message.total_count, items_per_page, page);
                    }
                }
            });
        }            
        function renderEmployeeCards(employees) {
            let $list = $('#team-directory-list');
            $list.empty();
        
            if (!employees.length) {
                $list.html('<p class="text-muted ml-3">No employees found.</p>');
                return;
            }
        
            employees.forEach(employee => {
                let email = employee.personal_email || '';
                $list.append(`
                    <div class="col-md-4 mb-4"> 
                        <div class="card h-100 d-flex flex-column theme-card">
                            <div class="card-body d-flex align-items-center" style="padding: 16px; border: 1px solid #ddd; border-radius: 7px;">
                                <div class="employee-photo-container" style="width: 150px; height: 150px; overflow: hidden; border-radius: 50%; border: 2px solid #ddd;">
                                    <img src="${employee.image || '/assets/frappe/images/ui/user.png'}" class="employee-photo" alt="${employee.employee_name}" style="width: 100%; height: 100%; object-fit: cover;">
                                </div>
                                <div class="employee-info ml-3">
                                    <h5 class="card-title theme-text"" style="margin: 0; font-size: 16px; font-weight: 600;">${employee.employee_name}</h5>
                                    <p style="margin: 2px 0; font-size: 13px;"><strong>Designation:</strong> ${employee.designation || 'N/A'}</p>
                                    <p style="margin: 2px 0; font-size: 13px;"><strong>Employment Type:</strong> ${employee.employment_type || 'N/A'}</p>
                                    <p style="margin: 2px 0; font-size: 13px;"><strong>Phone:</strong> ${employee.cell_number || 'N/A'}</p>
                                    <p style="margin: 2px 0; font-size: 13px;"><strong>Email:</strong> ${email || 'N/A'}</p>
                                    <p style="margin: 2px 0; font-size: 13px;"><strong>User ID:</strong> ${employee.user_id || 'N/A'}</p>
                                    <p style="margin: 2px 0; font-size: 13px;"><strong>Blood Group:</strong> ${employee.blood_group || 'N/A'}</p>
                                    <p style="margin: 2px 0; font-size: 13px; color: red;"><strong>Emergency Contact:</strong> ${employee.person_to_be_contacted || 'N/A'}</p>
                                    <p style="margin: 2px 0; font-size: 13px; color: red;"><strong>Emergency Phone:</strong> ${employee.emergency_phone_number || 'N/A'}</p>
                                    <div style="margin-top: 12px;">
                                        <button class="btn btn-primary btn-sm email-button" data-email="${email}">Email</button>
                                        <a href="tel:${employee.cell_number}" class="btn btn-success btn-sm">Call</a>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `);
            });
        
            // Attach event listener with event delegation
            $(document).off('click', '.email-button').on('click', '.email-button', function () {
                let email = $(this).data('email');
                console.log("Selected Employee Email:", email); // Debugging log
        
                if (email && email !== "N/A") {
                    email_doc(email);
                } else {
                    frappe.msgprint(__('No email available for this employee.'));
                }
            });
        
            // Function to open Frappe email pop-up
            function email_doc(email) {
                new frappe.views.CommunicationComposer({
                    doc: {
                        doctype: "Employee",
                        name: email
                    },
                    subject: "",
                    recipients: email,
                    attach_document_print: true,
                    message: ""
                });
            }
        }
        
    
 function renderPagination(total, per_page, current_page) {
        let total_pages = Math.ceil(total / per_page);
        let $pagination = $('#pagination');
        $pagination.empty();
        
        for (let i = 1; i <= total_pages; i++) {
            $pagination.append(`
                <button class="btn btn-sm ${i === current_page ? 'btn-primary' : 'btn-light'} mx-1 pagination-btn" data-page="${i}">${i}</button>
            `);
        }
        $('.pagination-btn').on('click', function () {
            fetchTeamDirectory($(this).data('page'));
        });
    }
    
    function updateThemeStyles() {
        let isDark = $('body').hasClass('dark-theme');
        $('.theme-text').css('color', isDark ? '#ffffff' : '#000000');
        $('.theme-card').css({ 'background-color': isDark ? '#333' : '#fff', 'color': isDark ? '#fff' : '#000', 'border': isDark ? '1px solid #555' : '1px solid #ddd' });
    }
    
    let observer = new MutationObserver(updateThemeStyles);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
}).appendTo(actionRow);

    
    

 // Create a new row for the Project Status Chart and Table
const chartTableRow = $('<div class="row mb-3"></div>').appendTo(ProjectHealthSection);

// Chart Container
const projectStatusChart = $(`
    <div class="col-md-6">
        <div id="project-status-chart"></div>
    </div>
`).appendTo(chartTableRow);

// Table Container
const projectStatusTable = $(`
    <div class="col-md-6">
        <h5>Project Status Summary</h5>
        <table class="table table-bordered">
            <thead>
                <tr>
                    <th>Status</th>
                    <th>Count</th>
                </tr>
            </thead>
            <tbody id="project-status-table-body">
                <tr><td colspan="2" class="text-center">Loading...</td></tr>
            </tbody>
        </table>
    </div>
`).appendTo(chartTableRow);

// Fetch Data for Project Status Chart and Table
frappe.call({
    method: 'nextproject.nextproject.page.team_dashboard.team_dashboard.get_project_status_data',
    callback: function(r) {
        if (r.message) {
            const statusData = r.message;

            // Prepare data for the chart
            const chartData = statusData.map(statusItem => ({
                name: statusItem.status,
                value: statusItem.count,
            }));

            // Render Chart
            const chart = new frappe.Chart('#project-status-chart', {
                title: 'Project Status Distribution',
                data: {
                    labels: chartData.map(data => data.name),
                    datasets: [{
                        name: 'Projects',
                        chartType: 'percentage',
                        values: chartData.map(data => data.value),
                    }],
                },
                type: 'percentage',
                height: 300,
                colors: ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2'],
                axisOptions: {
                    xAxisMode: 'grouped',
                    yAxisMode: 'percentage',
                },
            });

            // Populate Table
            const tableBody = $('#project-status-table-body');
            tableBody.empty(); // Clear loading row

            statusData.forEach(statusItem => {
                tableBody.append(`
                    <tr>
                        <td>${statusItem.status}</td>
                        <td>${statusItem.count}</td>
                    </tr>
                `);
            });
        }
    },
});

frappe.call({
    method: 'nextproject.nextproject.page.team_dashboard.team_dashboard.get_all_card_data',
    callback: function (r) {
        if (r.message) {
            const data = r.message;

            $('#overall-project-completion').text(data.overall_project_completion.toFixed(2) + '%');

            // Fetch Open Risks ONLY when clicking the button
            $('#open-risks').off('click').on('click', function () {
                frappe.call({
                    method: "nextproject.nextproject.page.team_dashboard.team_dashboard.get_open_risks",
                    callback: function (r) {
                        if (r.message) {
                            frappe.set_route('List', 'Project Risk', { 'status': ['=', 'Risk Reported'] });
                        }
                    }
                });
            });

            // Pending Milestones
            $('#pending-milestones').off('click').on('click', function () {
                frappe.set_route('List', 'Project', { name: ['in', data.pending_milestones.join(',')] });
            });

            // Fetch Employee ID based on logged-in user
            let current_user = frappe.session.user;

            frappe.call({
                method: "frappe.client.get_value",
                args: {
                    doctype: "Employee",
                    filters: { user_id: current_user },
                    fieldname: "name"
                },
                callback: function (res) {
                    let employee_id = res.message ? res.message.name : null;

                    if (employee_id) {
                        $('#pmo-meetings-count').text(data.pmo_meetings_this_week.length);
                        $('#pmo-meetings-count').off('click').on('click', function () {
                            frappe.route_options = {
                                'status': 'Open',
                                'meeting_date': ['between', [frappe.datetime.week_start(), frappe.datetime.week_end()]],
                                'primary_consultant': ['=', employee_id]  // Apply filter dynamically
                            };
                            frappe.set_route('List', 'PMO Meetings');
                        });
                    }
                }
            });
        }
    }
});

// Append HR line for UI separation
$("<hr>").appendTo(page.body);
}

// Helper Functions to get the data from Python
function get_overall_project_completion() {
    return frappe.call({
        method: 'nextproject.nextproject.page.team_dashboard.team_dashboard.get_overall_project_completion',
        async: false
    }).message;
}

function get_open_risks() {
    return frappe.call({
        method: 'nextproject.nextproject.page.team_dashboard.team_dashboard.get_open_risks',
        async: false
    }).message;
}

function get_pending_milestones() {
    return frappe.call({
        method: 'nextproject.nextproject.page.team_dashboard.team_dashboard.get_pending_milestones',
        async: false
    }).message;
}

function get_pmo_meetings_this_week() {
    return frappe.call({
        method: 'nextproject.nextproject.page.team_dashboard.team_dashboard.get_pmo_meetings_this_week',
    }).then(response => {
        return response.message;  // Handle the returned data
    }).catch(error => {
        console.error("Error fetching PMO meetings:", error);
        return [];  // Return an empty array in case of an error
    });
}


function get_this_weeks_milestones() {
    return frappe.call({
        method: 'nextproject.nextproject.page.team_dashboard.team_dashboard.get_this_weeks_milestones',
        async: false
    }).message;
}



function fetchAllocationData() {
    frappe.call({
        method: "nextproject.nextproject.page.team_dashboard.team_dashboard.get_number_card_data",
        callback: function(response) {
            const data = response.message;

            // Update the data on number cards
            $("#this-week-allocation-count").text(data.this_week_allocation || 0);
            $("#task-allocation-hours-count").text(data.task_allocation_hours || 0);
            $("#total-working-hours-count").text(data.total_working_hours || 0);
        }
    });
}

function fetchNumberCardData() {
    frappe.call({
        method: 'nextproject.nextproject.page.team_dashboard.team_dashboard.get_timesheet_data',
        callback: function(response) {
            const data = response.message || {};
            $('#pending-timesheet-count').text(data.pending_timesheets || 0);
            $('#pending-approval-count').text(data.pending_approvals || 0);
        },
    });
}

function bindNumberCardEvents() {
    $('#pending-timesheet').click(() => {
        frappe.set_route('List', 'Timesheet Defaulter', {
            status: ['in', 'Open'],
            employee: frappe.session.user,
        });
    });

    $('#pending-approval').click(() => {
        frappe.set_route('List', 'Timesheet', {
            status: 'Draft',
        });
    });

    $('#timesheet-approval').click(() => {
        frappe.set_route('List', 'Timesheet Approval');
    });
}

function create_card(title, label, color, on_click) {
    return $(`<div class='col-md-4'>
        <div class='card' style='background-color: ${color}; color: white; cursor: pointer;'>
            <div class='card-body text-center'>
                <h4>${title}</h4>
                <button class='btn btn-light btn-sm mt-2'>${label}</button>
            </div>
        </div>
    </div>`).on('click', on_click);
}

function create_action_button(label, color, on_click) {
    return $(`<div class='col-md-4'>
        <button class='btn btn-block' style='background-color: ${color}; color: white;'>${label}</button>
    </div>`).on('click', on_click);
}

function create_chart_card(title, parent, options) {
    let chart_container = $(`<div class='col-md-6'><div class='card'>
        <div class='card-header'>${title}</div>
        <div class='card-body' style='height: 300px;'></div>
    </div></div>`).appendTo(parent);

    frappe.call({
        method: options.get_chart_data,
        callback: function(r) {
            if (r.message) {
                new frappe.Chart(chart_container.find('.card-body')[0], {
                    data: r.message,
                    type: options.chart_type
                });
            }
        }
    });
}


