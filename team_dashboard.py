import frappe
from datetime import datetime, timedelta
from frappe.utils import today, getdate, add_days, nowdate
from collections import defaultdict
import re
from frappe import _
from nextproject.nextproject.report.resource_allocation_summary.resource_allocation_summary import execute as e


def get_month_start():
    """Returns the first day of the current month."""
    today_date = datetime.strptime(today(), "%Y-%m-%d")
    return today_date.replace(day=1).strftime("%Y-%m-%d")


def get_month_end():
    """Returns the last day of the current month."""
    today_date = datetime.strptime(today(), "%Y-%m-%d")
    next_month = today_date.replace(day=28) + timedelta(days=4)
    return (next_month - timedelta(days=next_month.day)).strftime("%Y-%m-%d")


@frappe.whitelist()
def get_task_counts():
    today_date = getdate(today())
    current_user_email = frappe.session.user

    task_counts = {
        "today_count": 0, "today_team_count": 0,
        "overdue_count": 0, "overdue_team_count": 0,
        "upcoming_count": 0, "upcoming_team_count": 0
    }

    if current_user_email == "Administrator":
        return task_counts

    # Get Employee ID linked to the session user
    employee_id = frappe.get_value("Employee", {"user_id": current_user_email}, "name")
    if not employee_id:
        return task_counts

    # Get employee groups led by this employee
    employee_groups = frappe.get_all(
        "Employee Group",
        filters={"group_lead": employee_id},
        pluck="name"
    )

    # ----------------------
    # Personal Tasks Section
    # ----------------------
    personal_tasks = frappe.get_all(
        "Task",
        filters={"primary_consultant": employee_id},
        fields=["name", "status", "exp_start_date", "exp_end_date"]
    )

    for task in personal_tasks:
        start_date = getdate(task.get("exp_start_date")) if task.get("exp_start_date") else None
        end_date = getdate(task.get("exp_end_date")) if task.get("exp_end_date") else None
        status = task.get("status")

        if end_date and end_date <= today_date and status not in ["Completed", "Cancelled"]:
            task_counts["today_count"] += 1
        if end_date and end_date < today_date and status == "Overdue":
            task_counts["overdue_count"] += 1
        if start_date and start_date >= today_date:
            task_counts["upcoming_count"] += 1

    # -------------------
    # Team Tasks Section
    # -------------------
    if employee_groups:
        team_tasks = frappe.get_all(
            "Task",
            filters={
                "employee_group": ["in", employee_groups],
                "primary_consultant": ["!=", employee_id]  # exclude personal tasks
            },
            fields=["name", "status", "exp_start_date", "exp_end_date"]
        )

        for task in team_tasks:
            start_date = getdate(task.get("exp_start_date")) if task.get("exp_start_date") else None
            end_date = getdate(task.get("exp_end_date")) if task.get("exp_end_date") else None
            status = task.get("status")

            if end_date and end_date <= today_date and status not in ["Completed", "Cancelled"]:
                task_counts["today_team_count"] += 1
            if end_date and end_date < today_date and status == "Overdue":
                task_counts["overdue_team_count"] += 1
            if start_date and start_date >= today_date:
                task_counts["upcoming_team_count"] += 1

    frappe.logger().info(f"Task counts for user {current_user_email}: {task_counts}")
    return task_counts



@frappe.whitelist()
def set_primary_consultant_and_group(user):
    # Fetch the employee linked to the logged-in user
    employee = frappe.db.get_value("Employee", {"user_id": user}, "name")
    
    if not employee:
        return None  # If no employee is linked to the user, return None
    
    # Find the Employee Groups where the employee is listed in the child table
    employee_groups = frappe.db.sql("""
        SELECT DISTINCT parent AS name
        FROM `tabEmployee Group Table`
        WHERE employee = %s
    """, (employee,), as_dict=True)

    primary_consultant = frappe.db.get_value("Employee", {"name": employee}, "name")
    
    return {
        "employee_group": employee_groups[0]["name"] if employee_groups else None,
        "primary_consultant": primary_consultant
    }


@frappe.whitelist()
def daily_task_hours_chart():
    """Generates data for the Daily Task Hours chart, comparing allocation vs timesheet hours."""
    
    company_name = frappe.defaults.get_user_default("Company")

    # If no default company is set, fetch the first available company
    if not company_name:
        company_list = frappe.get_all("Company", fields=["name"], order_by="creation asc", limit=1)
        company_name = company_list[0].name if company_list else None

    if not company_name:
        return {"error": "No company found for the logged-in user."}
    
    current_user_email = frappe.session.user 
    employee_id = frappe.get_value("Employee", {"user_id": current_user_email}, "name")

    if not employee_id:
        return {"error": "No Employee record found for the logged-in user."}

    # Define the date range (start of the current month to the end)
    start_date = getdate(today()).replace(day=1)
    end_date = (start_date + timedelta(days=31)).replace(day=1) - timedelta(days=1)

    # Filters for resource allocation summary
    filters = {
        "company": company_name,
        "periodicity": "Daily",
        "employee": employee_id,
        "from_date": start_date,
        "to_date": end_date
    }
    print("filters-------------->",filters)
    columns, data, _, chart, ResourceAllocationSummary = e(filters)

    total_working_hours = 0
    total_allocation = 0

    for item in ResourceAllocationSummary:
        if item.get("label") == "Total Working Hours":
            total_working_hours = item.get("value")
        elif item.get("label") == "Total Allocation":
            total_allocation = item.get("value")

    # Fetch timesheet data
    timesheets = frappe.get_all(
        'Timesheet',
        fields=['start_date', 'total_hours'],
        filters={'start_date': ['between', [start_date, end_date]], 'employee': employee_id}
    )

    actual_hours = defaultdict(float)

    for timesheet in timesheets:
        ts_date = getdate(timesheet.start_date)
        actual_hours[ts_date] += timesheet.total_hours

    labels = []
    allocated_data = []
    actual_data = []

    for i in range((end_date - start_date).days + 1):
        date = add_days(start_date, i)
        labels.append(date.strftime("%Y-%m-%d"))
        allocated_data.append(total_allocation)  # Constant allocation per day
        actual_data.append(actual_hours.get(date, 0))

    return {
        'labels': labels,
        'datasets': [
            {'name': 'Allocated Hours', 'values': allocated_data},
            {'name': 'Actual Timesheet Hours', 'values': actual_data}
        ],
    }


@frappe.whitelist()
def task_completion_chart():
    """Generates data for the Task Completion chart for the logged-in user."""
    start_date = getdate(frappe.utils.get_first_day(frappe.utils.today()))
    end_date = getdate(frappe.utils.get_last_day(frappe.utils.today()))
    current_user_email = frappe.session.user 
    employee_id = frappe.get_value("Employee", {"user_id": current_user_email}, "name")

    if not employee_id:
        return {"error": "No Employee record found for the logged-in user."}

    # Fetch completed tasks where the logged-in user is the Primary Consultant
    completed_tasks = frappe.get_all(
        'Task',
        fields=['completed_on'],
        filters={
            'completed_on': ['between', [start_date, end_date]],
            'status': 'Completed',
            'primary_consultant': employee_id
        }
    )

    # Fetch expected tasks where the logged-in user is the Primary Consultant
    expected_tasks = frappe.get_all(
        'Task',
        fields=['exp_end_date'],
        filters={
            'exp_end_date': ['between', [start_date, end_date]],
            'primary_consultant': employee_id
        }
    )

    # Count completed tasks per day
    completion_count = defaultdict(int)
    for task in completed_tasks:
        if task.completed_on:
            task_date = getdate(task.completed_on)
            completion_count[task_date] += 1

    # Count expected completions per day
    expected_count = defaultdict(int)
    for task in expected_tasks:
        if task.exp_end_date:
            task_date = getdate(task.exp_end_date)
            expected_count[task_date] += 1

    # Generate data for all days in the month
    labels = []
    completed_data = []
    expected_data = []

    for i in range((end_date - start_date).days + 1):
        date = add_days(start_date, i)
        labels.append(str(date))  
        completed_data.append(completion_count.get(date, 0))
        expected_data.append(expected_count.get(date, 0))

    return {
        'labels': labels,
        'datasets': [
            {
                'name': 'Tasks Completed',
                'values': completed_data
            },
            {
                'name': 'Expected Completion by Expected End Date',
                'values': expected_data
            }
        ]
    }

@frappe.whitelist()
def get_timesheet_counts():
    today_date = getdate(today())
    current_user_email = frappe.session.user

    timesheet_counts = {
        "pending_timesheet_count": 0,
        "pending_approval_count": 0,
        "team_pending_timesheet_count": 0,
        "team_pending_approval_count": 0,
        "employee_id": None
    }

    # Administrator bypass
    if current_user_email == "Administrator":
        return timesheet_counts

    # Get Employee ID linked to the session user
    employee_id = frappe.get_value("Employee", {"user_id": current_user_email}, "name")
    if not employee_id:
        return timesheet_counts  

    timesheet_counts["employee_id"] = employee_id

    # Check if the user is a Group Lead
    group_lead = frappe.get_value("Employee Group", {"group_lead": employee_id}, "name")

    # Initialize an empty list for team members
    team_member_ids = []

    if group_lead:
        # Fetch all employees in the group (excluding the Group Lead)
        team_members = frappe.get_all(
            "Employee Group Table",
            filters={"parent": group_lead, "employee": ["!=", employee_id]},  # Exclude the group lead
            fields=["employee"]
        )
        team_member_ids = [emp["employee"] for emp in team_members]
    print("team_member_ids--------->",team_member_ids)

    timesheet_counts["team_member_ids"] = team_member_ids
    
    # Individual counts (For the user themselves)
    timesheet_counts["pending_timesheet_count"] = frappe.db.count(
        "Timesheet Defaulter", {"status": "Open", "employee": employee_id}
    )
    timesheet_counts["pending_approval_count"] = frappe.db.count(
        "Timesheet", {"status": "Draft", "employee": employee_id}
    )

    # Team counts (Exclude the Group Lead's own timesheets)
    if team_member_ids:
        timesheet_counts["team_pending_timesheet_count"] = frappe.db.count(
            "Timesheet Defaulter", {"status": "Open", "employee": ["in", team_member_ids]}
        )
        timesheet_counts["team_pending_approval_count"] = frappe.db.count(
            "Timesheet", {"status": "Draft", "employee": ["in", team_member_ids]}
        )
    else:
        # If the user is not a team lead, ensure counts remain 0
        timesheet_counts["team_pending_timesheet_count"] = 0
        timesheet_counts["team_pending_approval_count"] = 0

    return timesheet_counts



@frappe.whitelist()
def check_timesheet_approval_permission():
    # Check if the current user is an Administrator or has the required role/permission
    if frappe.session.user == "Administrator" or "Timesheet Approver" in frappe.get_roles():
        return {"has_permission": True}
    return {"has_permission": False}


@frappe.whitelist()
def get_chart_data(company_name=None):
    current_user_email = frappe.session.user
    employee_id = frappe.get_value("Employee", {"user_id": current_user_email}, "name")

    if not employee_id:
        return {
            "labels": ["Total Allocation", "Total Timesheet Hours"],
            "datasets": [{
                "name": "Hours", "values": [0, 0]
            }],
            "xAxis": {"title": "Month-Year"},
            "yAxis": {"title": "Time (hrs)"}
        }

    today = datetime.today().date()
    first_day_of_month = today.replace(day=1)
    last_day_of_month = (first_day_of_month + timedelta(days=31)).replace(day=1) - timedelta(days=1)

    if not company_name:
        company_name = frappe.get_value("Employee", {"name": employee_id}, "company")

    filters = {
        "company": company_name,
        "periodicity": "Monthly",
        "employee": employee_id,
        "from_date": first_day_of_month,
        "to_date": last_day_of_month
    }

    try:
        columns, data, _, chart, ResourceAllocationSummary = e(filters)
    except Exception as ex:
        return {"error": f"Failed to fetch report summary: {str(ex)}"}

    # Ensure report_summary is properly handled
    total_allocation = 0
    total_timesheet_hours = 0

    if isinstance(ResourceAllocationSummary, list):
        if len(ResourceAllocationSummary) > 1 and isinstance(ResourceAllocationSummary[1], dict):
            total_allocation = float(ResourceAllocationSummary[1].get("value", 0))
        if len(ResourceAllocationSummary) > 2 and isinstance(ResourceAllocationSummary[2], dict):
            total_timesheet_hours = float(ResourceAllocationSummary[2].get("value", 0))

    month_year_label = today.strftime('%b-%Y')

    result = {
        "labels": ["Total Allocation", "Total Timesheet Hours"],
        "datasets": [{
            "name": "Hours",
            "values": [total_allocation, total_timesheet_hours]
        }],
        "xAxis": {"title": month_year_label},
        "yAxis": {"title": "Time (hrs)"}
    }

    frappe.logger().info(f"Returning Chart Data: {result}")  # Debug log

    return result


@frappe.whitelist()
def get_productivity_data():
    user = frappe.session.user

    # Get the start and end of the current week
    today = datetime.today()
    start_of_week = today - timedelta(days=today.weekday())
    end_of_week = start_of_week + timedelta(days=6)

    # Weekly Task Completion Count
    completed_tasks = frappe.db.count('Task', {
        'status': 'Completed',
        'completed_on': ['>=', start_of_week],
        'completed_on': ['<=', end_of_week]
    })

    # Efficiency Calculation
    tasks_with_deadlines = frappe.db.count('Task', {
        'exp_end_date': ['>=', start_of_week],
        'exp_end_date': ['<=', end_of_week]
    })
    efficiency = (completed_tasks / tasks_with_deadlines * 100) if tasks_with_deadlines else 0

    # Top Performers (Energy Points for this week)
    top_performers = frappe.db.sql(
        """
        SELECT ep.owner as name, SUM(ep.points) as points
        FROM `tabEnergy Point Log` ep
        WHERE ep.creation BETWEEN %s AND %s
        GROUP BY ep.owner
        ORDER BY points DESC
        """,
        (start_of_week, end_of_week),
        as_dict=True
    )

    return {
        'weekly_task_completion_count': completed_tasks,
        'efficiency': efficiency,
        'top_performers': top_performers,
    }


@frappe.whitelist()
def get_employees(search_text=None, page=1, items_per_page=20):
    allowed_roles = {"System Manager"}
    
    # Get the current user's email and roles
    current_user_email = frappe.session.user
    user_roles = set(frappe.get_roles())

    # Check if the user has required roles
    is_allowed = bool(user_roles.intersection(allowed_roles))
    is_admin = current_user_email == "Administrator"

    # Get Employee ID for the current user
    employee_id = frappe.get_value("Employee", {"user_id": current_user_email}, "name")

    # Set filters
    filters = {"status": "Active"}

    # List of employees to fetch
    employee_ids = [employee_id]  # Include the logged-in user by default

    # Check if user is a group lead
    group_lead = frappe.get_value("Employee Group", {"group_lead": employee_id}, "name")

    if group_lead:
        team_member_ids = frappe.get_all(
            "Employee Group Table",
            filters={"parent": group_lead},
            fields=["employee"]
        )
        team_member_ids = [emp["employee"] for emp in team_member_ids]  # Extract employee IDs

        # Add team members to the list
        employee_ids.extend(team_member_ids)

    # System Manager should see all employees
    if is_allowed or is_admin:
        filters.pop("name", None)  # Remove name filter to show all employees
    else:
        filters["name"] = ["in", employee_ids]  # Restrict to user and their team

    # Search functionality
    search_filters = []
    if search_text:
        search_filters = [
            ["employee_name", "like", f"%{search_text}%"],
            ["first_name", "like", f"%{search_text}%"],
            ["middle_name", "like", f"%{search_text}%"],
            ["last_name", "like", f"%{search_text}%"],
        ]

    # Fetch employees
    employees = frappe.get_all(
        "Employee",
        fields=["name", "image", "employee_name", "designation", "employment_type", 
                "cell_number", "personal_email", "user_id", "blood_group","person_to_be_contacted", "emergency_phone_number"],
        filters=filters,
        or_filters=search_filters,
    )
    designation_rank = {
    "CEO": 1, "Director": 2, "Vice President": 3, "General Manager": 4,
    "Manager": 5, "Team Lead": 6,"Digital Marketing Executive":7, "VP Sales":8,
    "Implementation consultant / Trainee Consultant": 9 ,"Sr Software Engineer / Senior Developer" : 10,
    "Software Engineer": 11, "Software Developer": 12,"Trainee Software Engineer": 13, 
    "Intern": 14, "Housekeeping": 15
    }

    employees.sort(
        key=lambda emp: designation_rank.get(emp.get("designation", "").strip().title(), 100)
    )
    # Remove duplicates
    unique_employees = []
    seen_names = set()
    for emp in employees:
        if emp["employee_name"] not in seen_names:
            seen_names.add(emp["employee_name"])
            unique_employees.append(emp)

    total_count = len(unique_employees)

    # Pagination
    try:
        page = int(page) if page else 1  
        items_per_page = int(items_per_page) if items_per_page else 20 
    except ValueError:
        page = 1
        items_per_page = 20

    start_index = (page - 1) * items_per_page
    end_index = start_index + items_per_page

    return {
        "employees": unique_employees[start_index:end_index],
        "total_count": total_count
    }

@frappe.whitelist()
def get_project_status_data():
    result = frappe.db.sql("""
        SELECT status, COUNT(*) as count
        FROM `tabProject`
        WHERE status IS NOT NULL
        GROUP BY status
    """, as_dict=True)

    return result


@frappe.whitelist()
def get_all_card_data():
    # Fetch data for all cards
    data = {
        "overall_project_completion": get_overall_project_completion(),
        "pending_milestones": get_pending_milestones(),
        "pmo_meetings_this_week": get_pmo_meetings_this_week(),
    }
    return data


@frappe.whitelist()
def get_overall_project_completion():
    # Fetch all non-canceled projects and calculate the average percentage completion
    projects = frappe.get_all(
        'Project',
        filters={'status': ['!=', 'Cancelled']},  # Exclude canceled projects
        fields=['percent_complete']
    )
    
    if projects:
        total_percent = sum(project['percent_complete'] for project in projects)
        return total_percent / len(projects)
    
    return 0


@frappe.whitelist()
def get_pending_milestones():
    # Fetch project names with billing_percentage == 100% from milestone-based projects
    projects = frappe.get_all('Project', filters={'billing_based_on': "Milestone Based",'status': 'Open'}, fields=['name'])
    project_names = []
    for project in projects:
        milestones = frappe.get_all('Project Milestone Child', filters={'parent': project['name'], 'progress': 100}, fields=['parent'])
        project_names.extend([milestone['parent'] for milestone in milestones])
    return project_names


def get_pmo_meetings_this_week():
    current_user_email = frappe.session.user
    is_administrator = current_user_email == "Administrator"
    
    # Fetch employee ID linked to the logged-in user
    employee_id = frappe.get_value("Employee", {"user_id": current_user_email}, "name")
    print("employee_id--------------------->",employee_id)
    if not employee_id:
        return []  # Return empty if no employee is linked
    
    # Get current week's start and end date
    week_start = getdate(nowdate())
    week_end = add_days(week_start, 6)  # End of the current week
    
    filters = {
        "status": "Open",
        "meeting_date": ["between", [week_start, week_end]],
        "primary_consultant": employee_id
    }
    print('filters=------------->',filters)
    
    # Fetch PMO meetings with applied filters
    pmo_meetings = frappe.get_list(
        "PMO Meetings",
        filters=filters,
        fields=["name", "meeting_date", "status", "primary_consultant"]
    )
    
    return pmo_meetings


@frappe.whitelist()
def get_open_risks():
    allowed_roles = {"System Manager", "Projects User", "Projects Manager"}
    
    # Get the current user's email and roles
    current_user_email = frappe.session.user
    user_roles = set(frappe.get_roles())

    # Check if the user has the required roles
    is_allowed = bool(user_roles.intersection(allowed_roles))
    is_admin = current_user_email == "Administrator"

    # Get Employee ID for the current user
    employee_id = frappe.get_value("Employee", {"user_id": current_user_email}, "name")

    # If the user does not have permission, throw an exception
    if not (is_allowed or is_admin):
        frappe.throw("You do not have permission to view open risks.")

    # Return open risks from Project Risk doctype
    return frappe.get_all('Project Risk', filters={'status': 'Risk Reported'}, fields=['name'])


@frappe.whitelist()
def get_this_weeks_milestones():
    week_start = getdate(today())
    week_end = (getdate(today()) + timedelta(days=7))
    projects = frappe.get_all('Project', filters={'billing_based_on': "Milestone Based", 'status': 'Open'}, fields=['name'])
    task_ids = []
    
    for project in projects:
        milestones = frappe.get_all('Project Milestone Child', filters={'parent': project['name']}, fields=['*'])
        for milestone in milestones:
            task = frappe.get_doc('Task', milestone['milestone'])
            if task.exp_start_date and task.exp_end_date:
                if week_start <= task.exp_start_date <= week_end or week_start <= task.exp_end_date <= week_end:
                    task_ids.append(task.name)
    return task_ids


@frappe.whitelist()
def get_number_card_data():
    current_user_email_3 = frappe.session.user

    is_administrator_2 = current_user_email_3 == "Administrator"

    employee_id_4 = frappe.get_value("Employee", {"user_id": current_user_email_3}, "name")

    if not employee_id_4:
        return {
            "this_week_allocation": 0,
            "task_allocation_hours": 0,
            "total_working_hours": 0
        }

    today = datetime.today().date() 
    week_start = today - timedelta(days=today.weekday())
    print("week_start----------",week_start)
    week_end = week_start + timedelta(days=6)
    print("week_start----------",week_end)

    # Get the company associated with the employee
    company_name = frappe.get_value("Employee", employee_id_4, "company")

    if not company_name:
        return {
            "this_week_allocation": 0,
            "task_allocation_hours": 0,
            "total_working_hours": 0
        }

    query2 = frappe.db.sql(f"""
        SELECT Round(SUM(duration_per_day_in_hours),2) AS total_hours
        FROM `tabTask`
        WHERE primary_consultant = '{employee_id_4}' AND exp_start_date BETWEEN '{week_start}' AND '{week_end}'
    """,as_dict=True)

    task_allocation_hours = query2[0].total_hours if query2 and query2[0].total_hours else 0
    
    # Monthly Data for Total Working Hours
    user_filters = {
        "company": company_name,
        "periodicity": "Daily",
        "employee": employee_id_4,
        "from_date": week_start,
        "to_date": week_end
    }

    columns, data, _, charts, ResourceAllocationSummary = e(user_filters)

    if ResourceAllocationSummary[0].get("label") == "Total Working Hours":
        total_working_hrs_1 = ResourceAllocationSummary[0].get("value")
    print("total_working_hrs_1----------->",total_working_hrs_1)

    total_working_hours = total_working_hrs_1


    if ResourceAllocationSummary[1].get("label") == "Total Allocation":
        Total_Allocation = ResourceAllocationSummary[1].get("value")

    this_week_allocation_sum = Total_Allocation

    return {
        "this_week_allocation": this_week_allocation_sum,
        "task_allocation_hours": task_allocation_hours,
        "total_working_hours": total_working_hours
    }


@frappe.whitelist()
def get_number_card_data_1():
    current_user_email_3 = frappe.session.user

    # Get Employee ID for the current user
    employee_id_4 = frappe.get_value("Employee", {"user_id": current_user_email_3}, "name")

    if not employee_id_4:
        return {
            "this_week_allocation": 0,
            "task_allocation_hours": 0,
            "total_working_hours": 0
        }

    # Check if the user is a group lead in "Employee Group List"
    is_group_lead = frappe.db.exists("Employee Group", {"group_lead": employee_id_4})

    if not is_group_lead:
        return {
            "this_week_allocation": 0,
            "task_allocation_hours": 0,
            "total_working_hours": 0
        }

    today = datetime.today().date()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)

    # Get the company associated with the employee
    company_name = frappe.get_value("Employee", employee_id_4, "company")

    if not company_name:
        return {
            "this_week_allocation": 0,
            "task_allocation_hours": 0,
            "total_working_hours": 0
        }

    # Fetch task allocation hours for the team
    query2 = frappe.db.sql(f"""
        SELECT ROUND(SUM(duration_per_day_in_hours),2) AS total_hours
        FROM `tabTask`
        WHERE primary_consultant IN (
            SELECT name FROM `tabEmployee` WHERE reports_to = '{employee_id_4}'
        )
        AND exp_start_date BETWEEN '{week_start}' AND '{week_end}'
    """, as_dict=True)

    task_allocation_hours = query2[0].total_hours if query2 and query2[0].total_hours else 0

    # Fetch resource allocation summary
    team_filters = {
        "company": company_name,
        "periodicity": "Daily",
        "reports_to": employee_id_4,
        "employee": ["!=", employee_id_4],  # Exclude employee_id_4
        "from_date": week_start,
        "to_date": week_end
    }
    
    columns, data, _, charts, ResourceAllocationSummary_1 = e(team_filters)
    print("ResourceAllocationSummary$$$$_______________>",ResourceAllocationSummary_1)

    total_working_hours = 0
    this_week_allocation_sum = 0

    if ResourceAllocationSummary_1:
        if ResourceAllocationSummary_1[0].get("label") == "Total Working Hours":
            total_working_hours = ResourceAllocationSummary_1[0].get("value")

        if ResourceAllocationSummary_1[1].get("label") == "Total Allocation":
            this_week_allocation_sum = ResourceAllocationSummary_1[1].get("value")

    return {
        "this_week_allocation": this_week_allocation_sum,
        "task_allocation_hours": task_allocation_hours,
        "total_working_hours": total_working_hours
    }

@frappe.whitelist()
def get_timesheet_data():
    """Fetch pending timesheet and timesheet approval counts based on user roles."""
    allowed_roles = {"System Manager", "Projects User", "Projects Manager"}

    # Get the current user's email and roles
    current_user_email = frappe.session.user
    user_roles = set(frappe.get_roles())

    # Check if the user has required roles
    is_allowed = bool(user_roles.intersection(allowed_roles))
    is_admin = current_user_email == "Administrator"

    # Get Employee ID for the current user
    employee_id = frappe.get_value("Employee", {"user_id": current_user_email}, "name")

    if not (is_allowed or is_admin):
        frappe.throw("You are not authorized to view this data.", frappe.PermissionError)

    # Fetch pending timesheets only if the user is an Employee
    pending_timesheets = 0
    if employee_id:
        pending_timesheets = frappe.db.count("Timesheet Defaulter", {
            "status": "Open",
            "employee": employee_id,
        })

    # Fetch pending approvals only for allowed roles
    pending_approvals = 0
    if is_allowed or is_admin:
        pending_approvals = frappe.db.count("Timesheet", {
            "status": "Draft"
        })

    return {
        "pending_timesheets": pending_timesheets,
        "pending_approvals": pending_approvals,
    }


