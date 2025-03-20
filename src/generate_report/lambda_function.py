import base64
import datetime
import json
import logging
import os
import traceback
import uuid
from io import BytesIO, StringIO

import boto3
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

# Set up logger
logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
    """
    Execute Python code generated by LLM and return the results
    
    Args:
        event: Event containing Python code generated by LLM
        context: Lambda context
        
    Returns:
        Execution results in JSON string format
    """
    try:
        logger.info("Lambda execution started")
        
        # Get Python code from event - only process Bedrock Flow format
        python_code = None
        user_query = None
        for input_item in event['node']['inputs']:
            if input_item.get('name') == 'codeHookInput':
                content = input_item.get('value', '')
                # Extract user query and code separately
                if '<User_Query>' in content:
                    parts = content.split('</User_Query>')
                    user_query = parts[0].replace('<User_Query>', '').strip()
                    code_parts = parts[1].split('```python')
                    if len(code_parts) > 1:
                        python_code = code_parts[1].replace('```', '').strip()
                elif 'User Query' in content:
                    parts = content.split('```python')
                    user_query = parts[0].replace('User Query:', '').strip()
                    python_code = parts[1].replace('```', '').strip()
                else:
                    python_code = content.replace('```python', '').replace('```', '').strip()
                break
        
        if not python_code:
            logger.info("No Python code provided in the request")
            return json.dumps({
                'statusCode': 400,
                'body': 'No Python code provided'
            })
    
        # Generate unique execution ID
        execution_id = str(uuid.uuid4())
        logger.info(f"Starting execution with ID: {execution_id}")
        
        # Create a secure execution environment
        local_vars = {
            'boto3': boto3,
            'os': os,
            'BytesIO': BytesIO,
            'StringIO': StringIO,
            'json': json,
            'base64': base64,
            'execution_id': execution_id,
            'logger': logger,
            'pd': pd,
            'plt': plt,
            'np': np
        }
        
        # Execute modified code
        logger.info("Starting Python code execution")
        # Modify code to capture return value
        modified_code = python_code + "\n\n# Execute lambda_handler and capture result\nresult = lambda_handler({'query': 'execute analysis'}, None)"
        exec(modified_code, globals(), local_vars)
        logger.info("Python code execution completed successfully")
        
        # Get execution result and add user query
        result = local_vars.get('result', {})
        if isinstance(result, dict):
            result['userQuery'] = user_query
            
            # Check if imageBase64 is in the result and upload to S3
            if 'imageBase64' in result and result['imageBase64']:
                try:
                    # Get AWS account ID
                    if context and hasattr(context, 'invoked_function_arn'):
                        account_id = context.invoked_function_arn.split(':')[4]
                    else:
                        # If running locally or can't get account ID
                        account_id = "unknown-account"
                    
                    # Generate timestamp
                    timestamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
                    
                    # Convert base64 string to bytes
                    image_data = base64.b64decode(result['imageBase64'])
                    
                    # Upload to S3
                    s3 = boto3.client('s3')
                    bucket_name = "20250329-aws-educate-taylor-swift-workshop"
                    object_key = f"visualizations/{account_id}/{timestamp}_visualization.png"
                    
                    # Create BytesIO object and upload
                    img_data = BytesIO(image_data)
                    s3.upload_fileobj(img_data, bucket_name, object_key)
                    
                    # Add S3 URI to result
                    result['imageUri'] = f"s3://{bucket_name}/{object_key}"
                    logger.info(f"Successfully uploaded image to {result['imageUri']}")
                except Exception as e:
                    logger.error(f"Error uploading to S3: {str(e)}")
                    logger.error(traceback.format_exc())
            
            # If body contains S3 URI, move it to imageUri
            if 'body' in result and isinstance(result['body'], str) and result['body'].startswith('s3://'):
                result['imageUri'] = result['body']
                # Keep body if needed, but make sure imageUri exists
                
        logger.info(f"Execution result: {result}")
        
        # Convert result to JSON string and return
        logger.info("Lambda execution completed successfully")
        return json.dumps(result, ensure_ascii=False)
        
    except Exception as e:
        error_msg = f"Error executing Python code: {str(e)}"
        logger.error(f"Execution failed: {error_msg}")
        logger.error(traceback.format_exc())
        
        return json.dumps({
            'statusCode': 500,
            'body': error_msg
        }) 