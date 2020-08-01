# covid19-local-push

### 1. Prerequisites

Set up Firebase account for notifications.  
Download Google application credential file to project directory.

### 2. Configure parameters

The default runtime parameters need to be set for the IBM Cloud Function
There is a params.sample file to copy and use.

Copy the `params.sample` to `.params`.

Edit the `.params` file and add the required settings.

#### `params.sample:`

```json
{
  "GOOGLE_APPLICATION_CREDENTIALS": "<add_google_application_credentials>",
  "COUNTRY": "<add_country>",
  "DATE_OFFSET": "<add_date_offset>"
}
```
Set GOOGLE_APPLICATION_CREDENTIALS to the relative path of the Google application credential file.  
Set COUNTRY to the country that notifications will be sent.  The app is currently designed to support US (enter "US").  
Set DATE_OFFSET for the amount of days prior to the current to use when loading COVID-19 reports. Recommend using 1.  

### 4. Create the OpenWhisk action

As a prerequisite, [install the Cloud Functions (IBM Cloud OpenWhisk) CLI](https://cloud.ibm.com/docs/openwhisk?topic=cloud-functions-cli_install)

#### Create the OpenWhisk action

Run these commands to gather Node.js requirements, zip the source files, and upload the zipped files
to create a raw HTTP web action in OpenWhisk.

> Note: You can use the same commands to update the action if you modify the code or the .params.

```sh
npm install
rm action.zip
zip -r action.zip main.js package* node_modules
ibmcloud wsk action update covid19-push action.zip --kind nodejs:default --web raw --param-file .params
