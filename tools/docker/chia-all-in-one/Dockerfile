#FROM ghcr.io/chia-network/chia:latest AS chia_img

#EXPOSE 8555 8444
#ENV CHIA_ROOT=/root/.chia/my_testnet

FROM fnndsc/ubuntu-python3

ARG BRANCH=latest
ARG COMMIT=""

RUN apt-get update && apt-get -y install \
    sudo git lsb-release build-essential libpcre3 libpcre3-dev zlib1g zlib1g-dev libssl-dev wget && \
    apt-get clean all

WORKDIR /chia-blockchain

RUN echo "cloning ${BRANCH}" && \
    git clone --branch ${BRANCH} --recurse-submodules=mozilla-ca https://github.com/Chia-Network/chia-blockchain.git . && \
    # If COMMIT is set, check out that commit, otherwise just continue
    ( [ ! -z "$COMMIT" ] && git checkout $COMMIT ) || true && \
    echo "running build-script" && \
    /bin/sh ./install.sh

EXPOSE 8555 8444

ENV CHIA_ROOT=/root/.chia/my_testnet
ENV keys="generate"
ENV service="farmer"
ENV plots_dir="/plots"
ENV farmer_address=
ENV farmer_port=
ENV testnet="false"
ENV TZ="UTC"
ENV upnp="true"
ENV log_to_file="true"
ENV healthcheck="true"

ENV harvester="false"
ENV farmer="false"

RUN apt-get update && \
    apt-get install --no-install-recommends -y sudo tzdata curl && \
    rm -rf /var/lib/apt/lists/* && \
    ln -snf "/usr/share/zoneinfo/$TZ" /etc/localtime && echo "$TZ" > /etc/timezone && \
    dpkg-reconfigure -f noninteractive tzdata

RUN bash install.sh && . ./activate && bash install-timelord.sh && chia init

COPY entry.sh /entry.sh
COPY launch.sh /launch.sh
COPY launch.sh /launch.sh
COPY healthcheck.sh /healthcheck.sh
COPY private_testnet.yaml ./../root/.chia/my_testnet/config/config.yaml
RUN chmod +x /launch.sh

HEALTHCHECK --interval=1s --timeout=5s --start-period=60s --retries=300 CMD /healthcheck.sh

ENTRYPOINT [ "entry.sh" ]
CMD [ "launch.sh" ]