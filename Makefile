init:
	pipenv --python {{cookiecutter.python_version}}
	pipenv install --dev

# Command to run everytime you make changes to verify everything works
dev: flake lint test

# Verifications to run before sending a pull request
pr: init dev

{%- if cookiecutter.service_platform != "none" %}
PLATFORM ?= {{cookiecutter.service_platform}}
{%- endif %}
SERVICE_DOMAIN ?= {{cookiecutter.service_app_domain}}
SAM_TEMPLATE ?= template.yaml
ENV ?= ${USER}
APPNAME ?= $(shell basename ${CURDIR})
STACKNAME = $(APPNAME)-$(ENV)
AWS_REGION ?= $(shell aws configure get region)

ifdef CFN_EXEC_ROLE
	CFN_ROLE_ARGS = --role-arn ${CFN_EXEC_ROLE}
else
	CFN_ROLE_ARGS =
endif

ifdef QUICK
	QUICK =
else
	QUICK = validate build
endif

check_profile:
	# Make sure we have a user-scoped credentials profile set. We don't want to be accidentally using the default profile
	@aws configure --profile ${AWS_PROFILE} list 1>/dev/null 2>/dev/null || (echo '\nMissing AWS Credentials Profile called '${AWS_PROFILE}'. Run `aws configure --profile ${AWS_PROFILE}` to create a profile called '${AWS_PROFILE}' with creds to your personal AWS Account'; exit 1)

build:
	$(info Building application)
	sam build --use-container --parallel --template $(SAM_TEMPLATE)

validate:
	$(info linting SAM template)
	@sam validate --lint

deploy: $(QUICK)
	$(info Deploying to personal development stack)
	sam deploy \
		--region ${AWS_REGION} \
		--resolve-s3 \
		--no-fail-on-empty-changeset \
		--stack-name $(STACKNAME) \
		--template-file $(SAM_TEMPLATE) \
		--tags \
{%- if cookiecutter.service_platform != "none" %}
			Platform=$(PLATFORM) \
{%- endif %}
			ServiceDomain=$(SERVICE_DOMAIN) \
			ServiceName=$(APPNAME) \
			ServiceEnv=$(ENV) \
			StackName=$(STACKNAME) \
		--parameter-overrides \
{%- if cookiecutter.service_platform != "none" %}
			Platform=$(PLATFORM) \
{%- endif %}
			ServiceDomain=$(SERVICE_DOMAIN) \
			ServiceName=$(APPNAME) \
			ServiceEnv=$(ENV) \
			StackName=$(STACKNAME) \
		$(CFN_ROLE_ARGS)

describe:
	$(info Describing stack)
	@aws cloudformation describe-stacks --stack-name $(STACKNAME) --output table --query 'Stacks[0]'

outputs:
	$(info Displaying stack outputs)
	@aws cloudformation describe-stacks --stack-name $(STACKNAME) --output table --query 'Stacks[0].Outputs'

parameters:
	$(info Displaying stack parameters)
	@aws cloudformation describe-stacks --stack-name $(STACKNAME) --output table --query 'Stacks[0].Parameters'

resources:
	$(info Displaying stack resources)
	@aws cloudformation describe-stack-resources --stack-name "ccsa-infra-main" --output table --query 'StackResources[].[LogicalResourceId,ResourceType,PhysicalResourceId,ResourceStatus]'

delete:
	$(info Delete stack)
	@sam delete --stack-name $(STACKNAME) --no-prompts

function:
	$(info creating function: ${F})
	mkdir -p src/handlers/${F}
	touch src/handlers/${F}/__init__.py
	touch src/handlers/${F}/function.py
	touch src/handlers/${F}/requirements.txt
	mkdir -p tests/{unit,integration}/src/handlers/${F}
	touch tests/unit/src/handlers/${F}/__init__.py
	touch tests/unit/src/handlers/${F}/test_function.py
	touch tests/integration/src/handlers/${F}/__init__.py
	touch tests/integration/src/handlers/${F}/test_function.py
	mkdir data/${F}
	echo "{}" | tee data/${F}/{event,data,output}.json
	echo "{}" | tee data/${F}/{event,data,output}.schema.json

unit-test:
	$(info running unit tests)
	# Integration tests don't need code coverage
	pipenv run unit-test

integ-test:
	$(info running integration tests)
	# Integration tests don't need code coverage
	pipenv run integ-test

test:
	$(info running tests)
	# Run unit tests
	# Fail if coverage falls below 95%
	pipenv run test

flake8:
	$(info running flake8 on code)
	# Make sure code conforms to PEP8 standards
	pipenv run flake8 src
	pipenv run flake8 tests/unit tests/integration

pylint:
	$(info running pylint on code)
	# Linter performs static analysis to catch latent bugs
	pipenv run pylint src

mypy:
	$(info running mypy on code)
	# Analyzes correct type usage
	pipenv run mypy src

lint: pylint flake8 mypy

clean:
	$(info cleaning project)
	# remove sam cache
	rm -rf .aws-sam
