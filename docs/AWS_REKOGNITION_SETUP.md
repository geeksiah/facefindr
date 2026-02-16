# AWS Rekognition Setup

This guide helps you set up AWS Rekognition for face detection and matching in Ferchr.

## Prerequisites

- AWS Account
- IAM user with programmatic access

## Step 1: Create IAM User

1. Go to **AWS Console** → **IAM** → **Users**
2. Click **"Add users"**
3. User name: `ferchr-rekognition`
4. Select **"Access key - Programmatic access"**
5. Click **Next: Permissions**

### Attach Policy

Create a custom policy with these permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "rekognition:CreateCollection",
        "rekognition:DeleteCollection",
        "rekognition:IndexFaces",
        "rekognition:SearchFacesByImage",
        "rekognition:DeleteFaces",
        "rekognition:DetectFaces",
        "rekognition:ListFaces",
        "rekognition:ListCollections"
      ],
      "Resource": "*"
    }
  ]
}
```

6. Name the policy: `FerchrRekognitionPolicy`
7. Attach it to the user
8. Complete user creation and **save the Access Key ID and Secret**

## Step 2: Configure Environment Variables

Add to your `.env.local`:

```bash
# AWS Rekognition Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
```

### Supported Regions

Choose a region close to your users:
- `us-east-1` (N. Virginia) - Recommended for most US users
- `us-west-2` (Oregon)
- `eu-west-1` (Ireland) - Recommended for EU users
- `ap-southeast-1` (Singapore) - Recommended for Asia
- `af-south-1` (Cape Town) - Africa

## Step 3: Verify Setup

After adding the environment variables, restart your dev server:

```bash
pnpm dev
```

The face recognition features will automatically activate when:
1. AWS credentials are configured
2. Face recognition is enabled for an event

## How It Works

### On Photo Upload
1. Photo is uploaded to Supabase Storage
2. API route `/api/media/process` is called
3. Image is downloaded and sent to Rekognition
4. Faces are detected and indexed into an event-specific collection
5. Face metadata is stored in `face_embeddings` table

### On Face Search (Attendee)
1. Attendee uploads/captures a selfie
2. API route `/api/faces/search` is called
3. Rekognition searches the event's face collection
4. Matching photos are returned with similarity scores

## Pricing

AWS Rekognition pricing (as of 2024):

| Operation | Price (per 1,000) |
|-----------|-------------------|
| Face Detection | $1.00 |
| Face Indexing | $0.10 per face |
| Face Search | $0.40 per search |

**Estimated costs per event:**
- 1,000 photos × 2 faces avg = 2,000 faces indexed = $0.20
- 100 attendee searches = $0.04
- Total: ~$0.24 per event

## Troubleshooting

### "Access Denied" Error
- Verify IAM policy is attached correctly
- Check that Access Key ID and Secret are correct
- Ensure the region matches your configuration

### "Collection Not Found" Error
- The collection is auto-created on first face index
- Check if the event has face recognition enabled

### "No Face Detected" Error
- Image quality may be too low
- Face may be too small or at an extreme angle
- Try with a clearer, front-facing photo

## Security Notes

- Never commit AWS credentials to version control
- Use IAM roles with minimal permissions
- Rotate access keys periodically
- Consider using AWS Secrets Manager for production
