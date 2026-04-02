import pandas as pd
import numpy as np
import random
import os

def generate_dummy_data(num_rows=1000000):
    """
    Generates a dummy dataset with specified columns and saves it as a parquet file.
    """
    print(f"Generating {num_rows} rows of dummy data...")

    # Define options for categorical columns
    # YOU CAN EDIT THESE LISTS TO CUSTOMIZE THE DATA
    regulations = ['CFTC-P45', 'CFTC-P43', 'SEC', 'CSA', 'EMIR', 'EMIRUK', 'SFTR''SFTRUK','MIFIDUK', 'MiFID']
    asset_classes = ['EQ', 'CR', 'FX', 'CO', 'IR', 'XA', 'CEQ', 'SFT']
    control_types = ['Completeness', 'Accuracy', 'Exceptions', 'Validity', 'Valuations', 'Collateral', 'Timeliness']
    data_types = ['TRADESTATE', 'TRADEEVENT', 'VALUATION', 'COLLATERAL', ]
    sub_control_types = ['DTCC', 'RIVER', 'MUREX','SOPHIS','GCAL','SOPHIES']
    
    # Boolean/Text options for Explain columns
    ops_explain_opts = ['Manual adjustment required', 'System glitch', 'Data delay', 'Configuration error', 'None', 'Process gap']
    automated_explain_opts = ['Rule mismatch', 'Threshold breach', 'API failure', 'Timeout', 'None', 'Format error']
    
    remediation_plans = [
        'Investigate and fix root cause', 
        'Manual override and re-process', 
        'Update configuration', 
        'Escalate to support team', 
        'No action required',
        'Patch deployment scheduled'
    ]
    
    explain_issues = ['RRTC-1234']
    explain_issue_notifications = ['Email sent to ops', 'Ticket created', 'Slack alert fired', 'Dashboard updated', 'None']
    explain_issue_details = [
        'Mismatch fewer than 5 records', 
        'Timestamp out of bounds', 
        'Missing mandatory fields', 
        'Duplicate transaction IDs', 
        'Value exceeds tolerance',
        'Unknown entity identifier'
    ]

    # Generate data
    data = {
        'Regulation': np.random.choice(regulations, num_rows),
        'AssetClass': np.random.choice(asset_classes, num_rows),
        'Control Type': np.random.choice(control_types, num_rows),
        'Data Type': np.random.choice(data_types, num_rows),
        'Sub-ControlType': np.random.choice(sub_control_types, num_rows),
        'OpsExplain': np.random.choice(ops_explain_opts, num_rows),
        'AutomatedExplain': np.random.choice(automated_explain_opts, num_rows),
        'ErrorAge': np.random.randint(0, 72, num_rows),  # Error age in hours
        'RemediationPlan': np.random.choice(remediation_plans, num_rows),
        'RemediationStatus': [],
        'ExplainIssue': ['RRTC-' + str(np.random.randint(0, 2000)) for _ in range(num_rows)],
        'ExplainIssueNotification': np.random.choice(explain_issue_notifications, num_rows),
        'ExplainIssueDetail': np.random.choice(explain_issue_details, num_rows)
    }

    # Derive RemediationStatus from RemediationPlan
    data['RemediationStatus'] = [
        'Remediated' if plan == 'No action required' else 'Unremediated'
        for plan in data['RemediationPlan']
    ]

    df = pd.DataFrame(data)
    df['0-3'] = np.where(df['ErrorAge'] <= 3, 1, 0)
    df['3-7'] = np.where((df['ErrorAge'] > 3) & (df['ErrorAge'] <= 7), 1, 0)
    df['7-14'] = np.where((df['ErrorAge'] > 7) & (df['ErrorAge'] <= 14), 1, 0)
    df['14-30'] = np.where((df['ErrorAge'] > 14) & (df['ErrorAge'] <= 30), 1, 0)
    df['30-60'] = np.where((df['ErrorAge'] > 30) , 1, 0)
    

    # Output file
    output_file = 'dummy_controls_data.parquet'
    
    # Save to parquet
    print(f"Saving to {output_file}...")
    try:
        df.to_parquet(output_file, engine='pyarrow', index=False)
        print("Success! File saved.")
        print(f"File path: {os.path.abspath(output_file)}")
        print("\nFirst 5 rows:")
        print(df.head())
    except Exception as e:
        print(f"Error saving parquet file: {e}")
        # Fallback if pyarrow/fastparquet not installed? 
        # Usually pandas needs pyarrow or fastparquet for this.
        print("Make sure you have 'pyarrow' or 'fastparquet' installed (pip install pyarrow).")

if __name__ == "__main__":
    generate_dummy_data()
